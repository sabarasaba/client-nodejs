'use strict';

var SockJS = require('sockjs-client-node'),
	fetch = require('fetch'),
	_ = require('lodash');

module.exports = Channel;

function Channel(apiToken) {

	var handlers = {},
		self = this,
		client = null,
		clientStarted = false,
		clientClosed = false;
	
	this.startClient = function() {
		if (clientStarted) {
			return;
		}
		clientStarted = true;
		clientClosed = false;

		client = new SockJS((process.env.PIPEDRIVE_API_PROTOCOL || 'https')+'://'+(process.env.PIPEDRIVE_CHANNEL_HOST || 'channel.pipedrive.com')+'/sockjs');

		client.onopen = function () {
			// console.log('onopen');

			var data = apiToken;
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
			if (e && !e.wasClean) {
				console.log('sockJS onClose error', e);
			}

			if (!clientClosed) {
				// not closed by user - we have some connection error.
				self.restartClient();
				return;
			}

			clientStarted = false;
			if (handlers['close']) {
				_.each(handlers['close'], function(handler) {
					handler(e);
				});
			}
		};
	};

	this.restartClient = function() {
		console.log('automatic client restart');

		client.onopen = null;
		client.onclose = null;
		client.onmessage = null;
		client = null;

		clientStarted = false;

		setTimeout(self.startClient, (1+Math.random()*4)*1000);
	};

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
		if (!_.keys(handlers).length) {
			this.removeAllListeners();
		}
	};

	this.removeAllListeners = function() {
		handlers = {};
		clientClosed = true;

		if (client && client.close) {
			client.close();
		}
	};

}
