'use strict';

/* Magic Mirror
 * Module: MMM-TMB
 *
 * MIT Licensed.
 */

const NodeHelper = require('node_helper');
var request = require('request');

module.exports = NodeHelper.create({

    start: function() {
        this.started = false;
        this.config = null;
    },

    getData: function() {
        var self = this;

        var stopInfoUrl2 =  "https://api.tmb.cat/v1/transit" +
            "/parades/" + self.config.busStopCode +
            "?app_id=" + self.config.appId +
            "&app_key=" + self.config.appKey;

        var stopInfoUrl =  "http://192.168.1.135:8080/modules/MMM-TMB/stop.json";
        request({
            url: stopInfoUrl,
            method: 'GET',
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var stopInfo =  JSON.parse(body);

                var stopUrl2 =  "https://api.tmb.cat/v1/ibus"+
                    "/stops/" + self.config.busStopCode +
                    "?app_id=" + self.config.appId +
                    "&app_key=" + self.config.appKey;
                var stopUrl =  "http://192.168.1.135:8080/modules/MMM-TMB/times.json";

                request({
                    url: stopUrl,
                    method: 'GET',
                }, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        var stopTimes =  JSON.parse(body);

                        var iBus = new Array()
                        var data = stopTimes.data.ibus[0];

                        iBus['lineCode'] = data['line'];
                        iBus['busStopCode'] = data['line'];
                        iBus['tInS'] = data['t-in-s'];
                        iBus['tInMin'] = data['t-in-min'];

                        console.log(iBus);
                        self.sendSocketNotification("DATA", iBus);
                    }
                });
            }
        });




        setTimeout(function() { self.getData(); }, this.config.refreshInterval);
    },

    socketNotificationReceived: function(notification, payload) {
        var self = this;
        if (notification === 'CONFIG' && self.started == false) {
            self.config = payload;
            self.sendSocketNotification("STARTED", true);
            self.getData();
            self.started = true;
        }
    }
});