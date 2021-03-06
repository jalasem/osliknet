var express = require('express');
var router = express.Router();
var async = require('async');

var mdlwares = require('../libs/mdlwares');

var Trip = require('../models/trip');
var Message = require('../models/message');
var Order = require('../models/order');
var User = require('../models/user');

var winston = require('winston');
var path = require('path');
var logger = new (winston.Logger)({
    transports: [
		new (winston.transports.File)({
			filename: path.join(__dirname, '../logs/orders.log')
		})
    ],
	exitOnError: false
});

router.get('/', mdlwares.restricted, mdlwares.renderIndexUnlessXhr, function(req, res, next) {

	var limit = Number(req.query.limit);	
	limit = (limit && limit < 30 ? limit : 30);
	
	var page = Number(req.query.page) || 0;
	
	Order.find({
		$or: [{
			user: req.session.uid
		}, {
			tripUser: req.session.uid
		}]			
	}).sort('status -_id').skip(page * limit).limit(limit).populate('user tripUser trip').exec(function(err, orders) {
		if (err) {
			logger.error(err, {line: 37});
			
			res.status(500).type('json')
				.json({error: 'Unexpected server error.'});
				
			return;
		}
		
		orders.forEach(function(order) {
			order.trip.user = order.tripUser;
		});	
		
		User.setReaded('newOrders', req.session.uid);
		
		res.type('json').json({
			orders: orders
		});
	});
});

router.post('/add', mdlwares.restricted, function(req, res, next) {
	async.parallel({
		trip: function(callback) {	
			Trip.findById(req.body.trip).exec(function(err, trip) {
				callback(err, trip);
			});
		},
		order: function(callback){
			Order.findOne({
				trip: req.body.trip,
				user: req.session.uid
			}).exec(function (err, order) {
				callback(err, order);
			});
		},                    
	}, function(err, asyncRes) {
		if (err) {
			logger.error(err, {line: 74});
			
			res.status(500).type('json')
				.json({error: 'Unexpected server error.'});
				
			return
		}
		
		if (!asyncRes.trip) {
			res.status(400).type('json')
				.json({error: 'Trip not found.'});
				
			return;
		}
		
		if ( asyncRes.trip.isPassed() ) {
			res.status(400).type('json')
				.json({error: 'Trip is passed.'});
				
			return;
		}
		
		if (asyncRes.trip.user.toString() === req.session.uid) {
			res.status(400).type('json')
				.json({error: 'Order to the own trip.'});
				
			return;
		}		
		
		if (asyncRes.order) {
			res.status(400).type('json')
				.json({error: 'Only one order allowed.'});
				
			return;
		}
		
		var order = new Order({
			trip: req.body.trip,
			user: req.session.uid,
			tripUser: asyncRes.trip.user,
			message: req.body.message
		});
		
		order.save(function(err, order) {
			if (err) {
				logger.error(err, {line: 112});
				
				res.status(500).type('json')
					.json({error: 'Unexpected server error.'});
					
				return;
			}			
			
			User.setUnreaded('newOrders', order.tripUser, order.id);
			
			Order.find({
				user: order.user
			}).count().exec(function(err, count) {
				if (err) {
					logger.error(err, {line: 126});
					
					return;
				}
				
				User.stats(order.user, 'r_cnt', count);
			});
			
			Order.find({
				tripUser: order.tripUser
			}).count().exec(function(err, count) {
				if (err) {
					logger.error(err, {line: 138});
					
					return;
				}

				User.stats(order.tripUser, 't_order', count);
			});			
			
			res.type('json')
				.json({order: order});
		});	
	});

});

router.post('/status', mdlwares.restricted, mdlwares.checkOrderAccess, function(req, res, next) {
	var order = res.order;
	
	var orderUser = order.user.toString(),
		tripUser = order.trip.user.toString();

	var newStatus = Number(req.body.status);

	if (order.status === newStatus) {
		res.type('json')
			.json({order: order});
			
		return;
	}

	var checkAndSave = function(canAfterCurrent) {
		// var now = (new Date()).getTime() - 1000*60*60*24;
		// var isTripPassed = ( new Date(order.trip.when) ) < now;
		var isTripPassed = order.trip.isPassed();

		if (
			order.status !== canAfterCurrent || 
			( newStatus === sts.FINISHED && !isTripPassed ) || // finish before trip
			( isTripPassed && [sts.REFUSED, sts.CANCELLED, sts.FINISHED].indexOf(newStatus) === -1 ) //  can refus cancel and finish always
		) {
			res.status(401).type('json').json({error: 'Unauthorized'});

			return;
		}

		var oldStatus = order.status;
		order.status = newStatus;
		order.save(function(err, order) {
			if (err) {
				logger.error(err, {line: 207});
				
				res.status(500).type('json')
					.json({error: 'Unexpected server error.'});
					
				return;
			}

			var corr = (req.session.uid !== orderUser ? orderUser : tripUser);
			
			Message.addToOrder(order, {
				order: order.id,
				user: req.session.uid,
				corr: corr,
				message: 'I changed the order status from ' + Order.stsInv[oldStatus] + ' to ' + Order.stsInv[newStatus] + '.'
			}, function(err, message) {
				if (err) {
					logger.error(err, {line: 224});
					
					return;
				}
			});

			if (newStatus === sts.FINISHED) {					
				Order.find({
					user: orderUser,
					status: sts.FINISHED
				}).count().exec(function(err, count) {
					if (err) {
						logger.error(err, {line: 236});
						
						return;
					}
					
					User.stats(orderUser, 'r_proc', count);
				});
				
				Order.find({
					tripUser: tripUser,
					status: sts.FINISHED
				}).count().exec(function(err, count) {
					if (err) {
						logger.error(err, {line: 249});
						
						return;
					}
					
					User.stats(tripUser, 't_proc', count);
				});
			}
			
			res.type('json')
				.json({order: order});
		});
	};
	
	var sts = Order.sts;
	
	if (req.session.uid === orderUser) {
		switch(newStatus) {
			case sts.NEGOTIATION:
				checkAndSave(sts.CANCELLED);
				
				return;
			case sts.CANCELLED:
				checkAndSave(sts.NEGOTIATION);
			
				return;
		}			
	} else if (req.session.uid === tripUser) {
		switch(newStatus) {
			case sts.NEGOTIATION:
				checkAndSave(sts.REFUSED);
				
				return;
			case sts.PROCESSING:
				checkAndSave(sts.NEGOTIATION);
				
				return;
			case sts.REFUSED:
				checkAndSave(sts.NEGOTIATION);
				
				return;
			case sts.FINISHED:
				checkAndSave(sts.PROCESSING);
			
				return;
		}
	}
	
	res.status(401).type('json').json({error: 'Unauthorized'});
});

router.get('/trip/:id', mdlwares.restricted, function(req, res, next) {
	Order.findOne({
		trip: req.params.id,
		user: req.session.uid
	}).exec(function(err, order) {
		if (err) {
			logger.error(err, {line: 307});
			
			res.status(500).type('json')
				.json({error: 'Unexpected server error.'});
				
			return;
		}
		
		res.type('json')
			.json({order: order});
	});
});

module.exports = router;


				
				/*var message = new Message({
					order: order.id,
					user: req.session.uid,
					corr: corr,
					message: 'I changed the order status from ' + res.locals.orderStatus[oldStatus] + ' to ' + res.locals.orderStatus[newStatus] + '.'
				});		
				
				message.save(function(err, message) {
					if (err) {// log error							
						return;
					}

					User.setMessagesUnreaded(corr, order.id, message.id);
					
					Message.find({
						order: message.order
					}).count().exec(function(err, count) {
						if (err) {
							//log
							
							return;
						}
						
						order.msg_cnt = count;

						order.save(function(err, order) {
							if (err) {
								//log
							}						
						});
					});
				});*/
	
	/*var order = new Order({
		trip: req.body.trip,
		user: req.session.uid,
		message: req.body.message
	});

	order.save(function(err, order) {
		if (err) {
			res.status(err.name === 'ValidationError' ? 400 : 500);
			
			res.type('json')
				.json({error: err});
				
			return;
		}
		
		Trip.findById(req.body.trip).select('user').exec(function(error, trip) {
			User.setUnreaded('newOrders', trip.user, order.id);
		});
		
		User.stats(req.session.uid, 'r_cnt', 1);
		User.stats(req.session.uid, 't_order', 1);
		
		res.type('json')
			.json({order: order});
	});	*/
	
	/*var tripUids = [];
		
		orders.forEach(function(order) {
			var uid = order.trip.user.toString();
			
			if (tripUids.indexOf(uid) === -1) {
				tripUids.push(uid);
			}
		});*/
		
		// console.log(tripUids.length);
		// console.dir(tripUids);
		
		/*
		var _tripUids = [];
		var tripUids = orders.filter(function(order) {
			_tripUids.push( order.trip.user.toString() );
			return order.trip.user;
			// return ObjectId(order.trip.user);
			
			blockedTile.indexOf("118") != -1
		});
		
		User.find({
			_id: {$in: tripUids} // можно дублировать все равно вернет уникальных юзеров
		}).select('name gravatar_hash').exec(function(err, users) {
			if (err) {
				res.status(500).type('json')
					.json({error: err});
					
				return;
			}
			
			var usersIndex = {};
			
			users.forEach(function(user) {				
				usersIndex[user.id] = user
			});

			orders.forEach(function(order) {
				if (order.trip.user instanceof ObjectId) { // заполняет другие user магией если одинаковые uid
					order.trip.user = usersIndex[ order.trip.user.toString() ];
				}
			});
			
			User.setReaded('newOrders', req.session.uid);
			
			res.type('json').json({
				orders: orders
			});
		});*/
		
/*
	
	
	
	
	
	
	
	Trip.find({
		user: req.session.uid
	}).select({ _id: 1}).exec(function(err, trips) {
		if (err) {
			res.status(500)
				.type('json')
				.json({error: err});
				
			return;
		}
		
		var tids = trips.map(function(trip) {
			return trip.id;
		});
		
		Order.find({
			$or: [{
				trip: {$in: tids}
			}, {
				user: req.session._uid
			}]			
		}).sort({
			status: 1,
			created_at: -1
		}).populate('user trip').exec(function(err, orders) {
			if (err) {
				res.status(500)
					.type('json')
					.json({error: err});
					
				return;
			}
			
			var tripUids = [];
			
			orders.forEach(function(order) {
				var uid = order.trip.user.toString();
				
				if (tripUids.indexOf(uid) === -1) {
					tripUids.push(uid);
				}
			});
			
			// console.log(tripUids.length);
			// console.dir(tripUids);
			
			
			// var _tripUids = [];
			// var tripUids = orders.filter(function(order) {
				// _tripUids.push( order.trip.user.toString() );
				// return order.trip.user;
				return ObjectId(order.trip.user);
				
				// blockedTile.indexOf("118") != -1
			// });
			
			User.find({
				_id: {$in: tripUids} // можно дублировать все равно вернет уникальных юзеров
			}).select('name gravatar_hash').exec(function(err, users) {
				if (err) {
					res.status(500)
						.type('json')
						.json({error: err});
						
					return;
				}
				
				var usersIndex = {};
				
				users.forEach(function(user) {				
					usersIndex[user.id] = user
				});

				orders.forEach(function(order) {
					if (order.trip.user instanceof ObjectId) { // заполняет другие user магией если одинаковые uid
						order.trip.user = usersIndex[ order.trip.user.toString() ];
					}
				});
				
				User.setReaded('newOrders', req.session.uid);
				
				res.type('json').json({
					orders: orders
				});
			});
		});
	});

	
	return;
	

	async.parallel({
		orders: function(callback) {	
			Trip.find({
				user: req.session._uid,
				is_removed: false
			}).select({ _id: 1}).exec(function(err, trips) {
				if (err) {
					callback(err, trips);
						
					return;
				}
				
				var tids = trips.map(function(trip) {
					return trip._id;
				});
				
				Order.find({
					trip: {$in: tids}
				}).sort({
					created_at: -1
				})
				// .populate('user')
				.exec(function(err, orders) {
					if (err) {
						callback(err, trips);
							
						return;
					}
					
					callback(err, orders);
				});
			});		
		},
		myOrders: function(callback){
			Order.find({
				user: req.session._uid
			}, function (err, orders) {
				if (err) {
					callback(err, orders);
					
					return;
				}
				
				callback(err, orders);
			});
		}
	}, function(err, asyncRes){
		// can use res.team and res.games as you wish
		if (err) {
			res.status(500)
				.type('json')
				.json({error: err});
				
			return
		}
		
		var orders = asyncRes.orders.concat(asyncRes.myOrders);
		
		Order.populate(orders, {path: 'user trip'}, function(err, orders) {
			if (err) {
				res.status(500)
					.type('json')
					.json({error: err});
					
				return;
			}
			
			
			// res.type('json').json({
				// orders: orders
			// });return;
			
			
			var tripUids = orders.map(function(order) {
				return ObjectId(order.trip.user);
			});
			
			
// console.log('tripUidstripUidstripUidstripUidstripUids');
// console.dir(tripUids);
			
			User.find({
				_id: {$in: tripUids}
			}).exec(function (err, users) {
				if (err) {
					res.status(500)
						.type('json')
						.json({error: err});
						
					return;
				}
				
				var usersIndex = {};
				
				users.forEach(function(user) {					
					usersIndex[user._id] = user
				});

				orders.forEach(function(order) {
					order.trip.user = usersIndex[order.trip.user];
				});
				
				res.type('json').json({
					orders: orders
				});
			});
		});	
	});
	
	
	
*/

/*router.get('/:id', function(req, res, next) {	
	if (!req.xhr) {
		res.render('index');

		return;
	}
	
	async.parallel({
		trip: function(callback) {	
			Trip.aggregate([{
				$match: {
					'orders._id': ObjectId(req.params.id)
				}
			}, {
				$unwind: "$orders"
			}, {
				$match: {
					'orders._id': ObjectId(req.params.id)
				}
			}]).exec(function(err, trips) {
				if (err) {
					callback(err, trips);
					
					return;
				}
				
				Trip.populate(trips, {path: 'user orders.user'}, function(err, trips) {
					if (err) {
						callback(err, trips);
						
						return;
					}

					callback(err, trips[0]);
				});
			});			
		},
		messages: function(callback){
			Message.find({order: req.params.id})
				.sort({created_at: -1})
				.populate('user')
				.exec(function (err, messages) {
					callback(err, messages);
				});
		},                    
	}, function(err, asyncRes){
		// can use res.team and res.games as you wish
		if (err) {
			res.status(500)
				.type('json')
				.json({error: err});
				
			return
		}
		
		res.type('json').json(asyncRes);		
	});
	

	
	
	

	// Order.findOne({
		// _id: req.params.id
	// }, function(err, order) {
		// if (err) {
			// res.status(500)
				// .type('json')
				// .json({error: err});
				
			// return
		// }

		// res.render('orders/one', {
			// order:order,
			// session: JSON.stringify(req.session)
		// });
		
	// });  
});*/

/*router.post('/messages/add', function(req, res, next) {	
	var messages =  req.body.messages || {};
	messages.uid = req.session.uid

	// console.dir(req.body);
	
	Order.findByIdAndUpdate(
        req.body.order_id,
        {
			$push: {
				messages: messages
			}
		},
		// {new: true},
        function(err, order) {
			if (err) {
				res.status(err.name == 'ValidationError' ? 400 : 500);			
				
				res.type('json')
					.json({error: err});
					
				return;
			}
			
			res.redirect('/orders/' + req.body.order_id);
        }
    ); 
});*/

/*
router.get('/my', function(req, res, next) {
	if (!req.xhr) {
		res.render('index');

		return;
	}
	
	if (!req.session.uid) {
		res.status(401).json({error: 'Unauthorized'});

		return;
	}

	// 
	// .find({
		// 'orders.uid': req.session._uid
	// }).select({'orders.$': 1}).populate('uid')
	// 

	// 
	// aggregate([
	// {
		// $match: {
            // 'orders.uid': req.session._uid/*;
			// 'orders': { 
               // '$elemMatch': { 
                   // "uid": req.session.uid
				// }
			// }
        // }
	// }, {
		// $unwind: "$orders"
	// }]).
	// 
	
	
	
	

	Trip.aggregate([{
		$match: {
            'orders.user': req.session._uid
        }
	}, {
		$unwind: "$orders"
	}, {
		$match: {
            'orders.user': req.session._uid
        }
	}, {
		$sort : {
			'orders.status': 1,
			'orders.created_at' : -1
		}
	}]).exec(function(err, trips) {
		if (err) {
			res.status(500).type('json')
				.json({error: err});
				
			return;
		}
		
		// var res = {}
		
		// var out = trips.map(function(trip) {	
			// var order = trip.orders.id();
			
			// return {
				
			// };			
		// });
		
		Trip.populate(trips, {path: 'user'}, function(err, trips) {
			if (err) {
				res.status(500)
					.type('json')
					.json({error: err});
					
				return;
			}
			
			res.type('json')
				.json({trips: trips});
		});
		
		// res.type('json')
			// .json({trips: trips});
		
		// res.render('orders/index', {
			// orders:orders,
			// session: JSON.stringify(req.session)
		// });
			
		// console.log('%s --- %s.', trips.name, trips.from)
		// res.render('index', { title:trips[1].to + trips[0].from });
	});
});
*/

/*
{"error":{"name":"MongoError","message":"exception: bad query: BadValue unknown top level operator: $orders
.uid","errmsg":"exception: bad query: BadValue unknown top level operator: $orders.uid","code":16810
,"ok":0}}
*/


























