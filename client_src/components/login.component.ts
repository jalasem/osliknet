import {Component, ElementRef} from 'angular2/core';
import {FORM_DIRECTIVES, CORE_DIRECTIVES, FormBuilder, ControlGroup, Validators} from 'angular2/common';

import {ROUTER_DIRECTIVES} from 'angular2/router';

import {UserService} from '../services/user/user.service';

@Component({
	selector: 'login',
	templateUrl: '/client_src/tmpls/login.html',
	directives: [ROUTER_DIRECTIVES],
	pipes: []
})

export class LoginComponent {
	public model = {
		/*email: 'mcattendlg@gmail.com'*/
	};
	
	public form: ControlGroup;
	
	constructor(
		private _fb: FormBuilder,
		private _userService: UserService
	) {
		this.form = _fb.group({  
			email: ['', Validators.compose([
				(ctrl) => {
					if ( !/^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i.test(ctrl.value) ) {
						return {invalidEmail: true};
					}
					
					return null;
				},
				Validators.required]
			)]
		});
	}
	
	private _busy : boolean = false;
	public success : boolean = false;
	public error : string = '';
	
	public onSubmit($email) : void {
		if (this.form.valid) {
			this._busy = true;
			this.error = '';
			
			this._userService.login(this.model).subscribe(res => {
				this.success = true;

				this._busy = false;
			}, err => {
				this.error = 'Unexpected error. Try again later.';

				try {
					this.error = err.json().error || this.error;
				} catch(e) {}
				
				this._busy = false;
			});
		} else {
			$email.focus();
		}
	}
}

























