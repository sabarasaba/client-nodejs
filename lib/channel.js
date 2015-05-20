'use strict';

var SockJS = require('sockjs-client-node'),
	fetch = require('fetch'),
	_ = require('lodash');

module.exports = Channel;

function Channel(apiToken) {

	var handlers = {},
		self = this,
		client = null,
		clientStarted = false;
	
	this.startClient = function() {
		if (clientStarted) {
			return;
		}
		clientStarted = true;

		client = new SockJS((process.env.PIPEDRIVE_API_PROTOCOL || 'https')+'://'+(process.env.PIPEDRIVE_CHANNEL_HOST || 'channel.pipedrive.com')+'/sockjs');

		client.onopen = function () {
			// console.log('onopen');
			var options = {
				rejectUnauthorized: false
			};

			//hardcoded company id
			var data = {
				company_id: (process.env.PIPEDRIVE_NONCE_DEMO_COMPANY_ID || 64),
				user_id: (process.env.PIPEDRIVE_NONCE_DEMO_USER_ID || 57)
			};

			data.nonce = 'demo-'+data.user_id+'-'+data.company_id;

			client.send(JSON.stringify({
				company_id: data.company_id,
				user_id: data.user_id,
				user_name: 'client-nodejs-user',
				host: 'app.pipedrive.com',
				timestamp: Math.round(new Date().getTime() / 1000),
				nonce: data.nonce
			}));
		};
		client.onmessage = function (msg) {
			// console.log('onmessage');
			if (msg && msg.type === 'message') {
				var data = {},
					eventPatterns = [];

				try {
					data = JSON.parse(msg.data);
				}
				catch (e) {
					throw new Error('Malformed JSON received from socket');
				}

				if (data && data.meta && data.meta.v === 1) {

					eventPatterns = [
						data.meta.object + '.' + data.meta.action,
						'*.' + data.meta.action,
						data.meta.object + '.*',
						'*.*'
					];

					_.each(eventPatterns, function(pattern) {
						if (handlers[pattern]) {
							_.each(handlers[pattern], function(handler) {
								handler(data, data.data);
							});
						}
					});
				}

				if (data.rabbitStateChange === 'open') {
					if (handlers['connect']) {
						_.each(handlers['connect'], function(handler) {
							handler();
						});
					}
				}
			}
		};
		client.onclose = function (e) {
			console.log('sockJS onClose', e);
			clientStarted = false;
			if (handlers['close']) {
				_.each(handlers['close'], function(handler) {
					handler(e);
				});
			}
		};
	}

	this.on = function(method, handler) {
		if (!clientStarted) {
			self.startClient();
		}
		handlers[method] = handlers[method] || [];
		handlers[method].push(handler);
	};

	this.removeListener = function(method, handler) {
		var index = handlers[method].indexOf(handler);
		if (index > -1) {
			handlers[method].splice(index, 1);
		}
		if (!handlers.length) {
			this.removeAllListeners();
		}
	}

	this.removeAllListeners = function() {
		handlers = {};
		if (client && client.close) {
			client.close();
		}
	}

}
