var express = require('express');
var router = express.Router();
var async = require('async');

var Trip = require('../models/trip');
var Message = require('../models/message');
var Order = require('../models/order');
var User = require('../models/user');

var ObjectId = require('mongoose').Types.ObjectId;

router.get('/last/:orderId/:lastId', function(req, res, next) {
	//?????????????????????????? populate vs paralell
	Order.findById(req.params.orderId)./*populate('trip').*/exec(function(err, order) {			
		if (err) {
			res.status(500)
				.type('json')
				.json({error: err});
			//{"error":{"message":"Cast to ObjectId failed for value \"33\" at path \"_id\"","name":"CastError","kind":"ObjectId","value":"33","path":"_id"}}
			return;
		}		
		
		async.parallel({
			trip: function(callback) {
				Trip.findById(order.trip).exec(function(err, trip) {
					callback(err, trip);
				});			
			},
			messages: function(callback){
				var conds = {
					order: order._id
				};
				
				if (req.params.lastId != 0) {
					conds._id = { $gt: req.params.lastId }
				}
				
				Message.find(conds).sort({
					created_at: 1
				}).populate({
					path: 'user',
					select: 'name gravatar_hash'
				}).exec(function (err, messages) {	
					callback(err, messages);
				});
			},                    
		}, function(err, asyncRes) {
			if (err) {
				res.status(500)
					.type('json')
					.json({error: err});
					
				return
			}
			
			if (req.session.uid !== order.user.toString() && req.session.uid !== asyncRes.trip.user.toString()) {
				res.status(401)
					.type('json')
					.json({error: 'Unauthorized'});
					
				return;
			}

			User.setMessagesReaded(req.session.uid, order.id);

			res.type('json').json({messages: asyncRes.messages});			
		});
		
	});
});

router.get('/order/:id', function(req, res, next) {	
	if (!req.xhr) {
		res.render('index');

		return;
	}

	async.parallel({
		order: function(callback) {
			Order.findById(req.params.id).populate({
					path: 'trip',
					populate: {
						path: 'user',
						model: 'User',
						select: 'name gravatar_hash'
					}
				}).populate({
					path: 'user',
					select: 'name gravatar_hash'
				}).exec(function (err, order) {
					if (err) {
						callback(err, order);
						
						return;
					}
					
					callback(err, order);
					
					/*Trip.populate(order.trip, {
						path: 'user',
						select: 'name gravatar_hash'
					}).exec(function(err, trip) {
						callback(err, order);
					});*/
				});		
		},
		messages: function(callback){
			Message.find({order: req.params.id})
				.sort({created_at: 1})
				.populate({
					path: 'user',
					select: 'name gravatar_hash'
				}).exec(function(err, messages) {
					callback(err, messages);
				});
		},
	}, function(err, asyncRes) {
		if (err) {
			res.status(500)
				.type('json')
				.json({error: err});
				
			return
		} 
		
// console.log('asyncRes.order.trip = ', asyncRes.order.trip);
console.log('asyncRes.order.trip.user = ', asyncRes.order.trip.user);

		if ( req.session.uid !== asyncRes.order.user.id && req.session.uid !== asyncRes.order.trip.user.id ) {
			res.status(401)
				.type('json')
				.json({error: 'Unauthorized'});
				
			return;
		}	

		User.setMessagesReaded(req.session.uid, asyncRes.order.id);
		
		res.type('json').json(asyncRes);		
	});
	
	/*
	return;
	
	Message.find({order: req.params.id})
		.sort({created_at: 1})
		.populate('user', 'name gravatar_hash')
		.exec(function (err, messages) {

			
			if (err) {
				res.status(500)
					.type('json')
					.json({error: err});
					
				return
			}
			
			res.type('json').json({messages: messages});
		});
		
		
	return;
	
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
				.sort({created_at: 1})
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
	

	
	
	*/

	/*Order.findOne({
		_id: req.params.id
	}, function(err, order) {
		if (err) {
			res.status(500)
				.type('json')
				.json({error: err});
				
			return
		}

		res.render('orders/one', {
			order:order,
			session: JSON.stringify(req.session)
		});
		
	});  */
});

router.post('/add', function(req, res, next) {
	
	
	/*
	todo 
	
	check if user can save message with this order_id
	*/
if (!req.session.uid) {
	res.status(401);

	return;
}
	
	req.body.user = req.session.uid;
	
	
	Order.findById(req.body.order).populate('trip').exec(function(err, order) {
		if (err) {
			res.status(500)
				.type('json')
				.json({error: err});
				
			return;
		}
		
		if ( req.session.uid !== order.user.toString() && req.session.uid !== order.trip.user.toString() ) {
			res.status(401)
				.type('json')
				.json({error: 'Unauthorized'});
			
			return;
		}
		
		var message = new Message(req.body);		
		
		message.save(function(err, message) {
			if (err) {
				res.status(err.name == 'ValidationError' ? 400 : 500)				
				
				res.type('json')
					.json({error: err});
					
				return;
			}
console.log('order.id = ', order.id)
			User.setMessagesUnreaded(req.session.uid !== order.user.toString() ? order.user : order.trip.user, order.id);
			
			res.type('json')
				.json({message: message});
		});
	});
	
	
	

});

module.exports = router;

/*
{"error":{"name":"MongoError","message":"exception: bad query: BadValue unknown top level operator: $orders
.uid","errmsg":"exception: bad query: BadValue unknown top level operator: $orders.uid","code":16810
,"ok":0}}
*/


























