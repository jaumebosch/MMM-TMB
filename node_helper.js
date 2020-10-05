'use strict';

/* Magic Mirror
 * Module: MMM-TMB
 *
 * By @jaumebosch
 * MIT Licensed.
 */

const NodeHelper = require('node_helper');
const axios = require('axios');
const request = require('request');
const Log = require("../../js/logger");

module.exports = NodeHelper.create({

	start: function () {
		Log.log("Starting node helper for: " + this.name);
		this.started = false;
		this.config = null;
		this.config = null;
	},

	getData: async function () {
		const self = this;
		let iBus = [];

		let dataStop = {};

		for (let i = 0; i < self.config.busStops.length; i++) {
			let busStopCode = Number(self.config.busStops[i].busStopCode);
			let busLine = null;
			if (self.config.busStops[i].busLine){
				busLine = self.config.busStops[i].busLine;
			}

			dataStop = await self.fetchDataStop(busStopCode);
			dataStop.dataLines = await self.fetchDataLine(busStopCode, busLine);

			if (dataStop.dataLines.length > 0) {
				iBus.push(dataStop);
			}
		}

		this.sendSocketNotification("DATA", iBus);

		setTimeout(function () {
			self.getData();
		}, self.config.refreshInterval);
	},

	fetchDataStop: async function(busStopCode) {
		const self = this;
		let dataStop = {};

		let busStopInfoUrl = "https://api.tmb.cat/v1/transit" +
			"/parades/" + busStopCode +
			"?app_id=" + self.config.appId +
			"&app_key=" + self.config.appKey;


		await axios.get(busStopInfoUrl)
			.then(response => {
				let stopInfoData = response.data.features[0].properties;
				dataStop = {
					busStopCode: stopInfoData['CODI_PARADA'],
					busStopName: stopInfoData['NOM_PARADA'],
				};
			})
			.catch(error => {
				console.log(error);
			});

		return dataStop;
	},

	fetchDataLine: async function(busStopCode, busLine = null) {
		const self = this;
		let dataLine = [];

		let busLineInfoUrl =  "https://api.tmb.cat/v1/ibus";

		if (busLine){
			busLineInfoUrl += "/lines/" + busLine;
		}

		busLineInfoUrl +=  "/stops/" + busStopCode +
			"?app_id=" + self.config.appId +
			"&app_key=" + self.config.appKey;

		await axios.get(busLineInfoUrl)
			.then(response => {
				let lineInfoData = response.data.data.ibus;

				for (let k = 0; k < lineInfoData.length; ++k) {
					let busLineCode = lineInfoData[k]['line']
					if (busLine){
						busLineCode = busLine
					}

					dataLine.push(
						{
							lineCode:busLineCode,
							tInS:lineInfoData[k]['t-in-s'],
							tInText:lineInfoData[k]['text-ca'],
							tInMin:lineInfoData[k]['t-in-min'],
						}
					);
				}
			})
			.catch(error => {
				console.log(error);
			});

		return dataLine;
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === 'CONFIG' && this.started == false) {
			this.config = payload;
			this.sendSocketNotification("STARTED", true);
			this.getData();
			this.started = true;
		}
	}
});
