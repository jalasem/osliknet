import {AppComponent} from './components/app';
import {bootstrap} from 'angular2/platform/browser';
import {APP_BASE_HREF, ROUTER_PROVIDERS} from 'angular2/router';
import {provide} from 'angular2/core';
import {Http} from 'angular2/http';

import 'rxjs/Rx' 
// import 'rxjs/add/operator/map';
// import 'rxjs/add/operator/catch';

import {LazyMapsAPILoader, LazyMapsAPILoaderConfig} from './services/maps-api-loader/lazy-maps-api-loader';

declare var window: any;

bootstrap(AppComponent, [
	ROUTER_PROVIDERS,
	provide(APP_BASE_HREF, {useValue: '/'}),
	// HTTP_PROVIDERS,
	Http,
	// provide(window, {useValue: window}),
	provide(window, {useValue: window}),
	provide(LazyMapsAPILoaderConfig, {useFactory: () => {
		return {
			apiKey: 'AIzaSyBjCE2t7x2LK0YttTxEz9rN9hcuOxa9gfQ',
			apiVersion: 3,
			params: '&libraries=places&signed_in=true&language=en'
		};
	}}),
	provide('config.user', {useFactory: () => {
		return window.user;
	}}),
	provide('config.orderStatus', {useFactory: () => {
		return {
			0: 'Pending',
			1: 'Processing',
			2: 'Refused',
			3: 'Finished'
		};
	}}),
	LazyMapsAPILoader
]);