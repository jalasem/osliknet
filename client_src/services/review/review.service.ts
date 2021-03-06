import {Injectable} from 'angular2/core';
import {Http, URLSearchParams, Headers} from 'angular2/http';

@Injectable()

export class ReviewService {
	constructor(public http:Http) { }

	public add(data) {
		let headers = new Headers();
		headers.append('Content-Type', 'application/json');
		headers.append('X-Requested-With', 'XMLHttpRequest');
	
		return this.http.post('/reviews/add?xhr', JSON.stringify(data), {			
			headers: headers
		}).map( res => <any[]> res.json() );
	}
	
	public getByOrderId(id) {	
		let headers = new Headers();
		headers.append('X-Requested-With', 'XMLHttpRequest');
	
		return this.http.get('/reviews/order/' + id + '?xhr', {
			headers: headers
		}).map( res => <any[]> res.json() );
	}
	
	public get(limit, page) {	
		let headers = new Headers();
		headers.append('X-Requested-With', 'XMLHttpRequest');
		
		let search : URLSearchParams = new URLSearchParams();
		
		if (limit)
			search.set('limit', limit);	
		
		if (page)
			search.set('page', page);
		
		return this.http.get('/reviews?xhr', {
			search: search,
			headers: headers
		}).map( res => <any[]> res.json() );
	}
	
	public calculateRating(rawRate) {
		var total = (rawRate || []).reduce((res, count, rate) => {
			count = Number(count);			
			if (!count) {
				return res;
			}
			
			return [res[0] + count, res[1] + ( count * (rate + 1) )];
		}, [0, 0]);

		return [ total[0], total[0] ? ( total[1]/total[0] ).toFixed(1) : 0 ];
	}
}