'use strict';

/* Magic Mirror
 * Module: MMM-TMB
 *
 * By @jaumebosch
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

        var iBus = new Object();
        var stopInfoUrl =  "https://api.tmb.cat/v1/transit" +
            "/parades/" + Number(self.config.busStopCode) +
            "?app_id=" + self.config.appId +
            "&app_key=" + self.config.appKey;

        request({
            url: stopInfoUrl,
            method: 'GET',
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var stopInfo =  JSON.parse(body);
                var data = stopInfo.features[0].properties;
                iBus = {
                            busStopCode:data['CODI_PARADA'],
                            busStopName:data['NOM_PARADA'],
                        };

                var stopUrl =  "https://api.tmb.cat/v1/ibus";

                if (self.config.busLine){
                   stopUrl += "/lines/" + self.config.busLine;
                }

                stopUrl +=  "/stops/" + Number(self.config.busStopCode) +
                    "?app_id=" + self.config.appId +
                    "&app_key=" + self.config.appKey;

                request({
                    url: stopUrl,
                    method: 'GET',
                }, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        var stopTimes =  JSON.parse(body);
                        var line = new Array();
                        iBus.lines = {};
                        var data = stopTimes.data.ibus;
                        var index;
                        for (index = 0; index < data.length; ++index) {
                            line.push(
                                {
                                    lineCode:data[index]['line'],
                                    tInS:data[index]['t-in-s'],
                                    tInText:data[index]['text-ca'],
                                    tInMin:data[index]['t-in-min'],
                                }
                            );
                        }
                        iBus.lines = line;
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
