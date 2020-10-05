/* global Module */

/* Magic Mirror
 * Module: MMM-TMB
 *
 * By @jaumebosch
 * MIT Licensed.
 */


Module.register("MMM-TMB", {
    defaults: {
        timeFormat: config.timeFormat,
        maxEntries: 5,
        refreshInterval: 30000,
        retryDelay: 5000,
        warningTime: 600,
        blinkingTime: 300,
        imminentTime: 60,
    },

    requiresVersion: "2.1.0", // Required version of MagicMirror

    // Define required scripts.
    getScripts: function() {
        return ["moment.js"];
    },

    // Define requird styles
    getStyles: function() {
        return ["font-awesome.css", 'MMM-TMB.css'];
    },

    start: function() {
        Log.info('Starting module: ' + this.name);

        this.loaded = false;
        this.sendSocketNotification('CONFIG', this.config);
    },

    getDom: function() {
		let wrapper = document.createElement("div");

        if (this.config.appId === "") {
            wrapper.innerHTML = "Please set the correct <i>APP ID</i> in the config for module";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (this.config.appKey === "") {
            wrapper.innerHTML = "Please set the correct <i>APP KEY</i> in the config for module";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

       /* if (this.config.busStationCode === "") {
            wrapper.innerHTML = "Please set the <i>Station Code</i> in the config for module";
            wrapper.className = "dimmed light small";
            return wrapper;
        }*/

         if (this.config.blinkingTime > this.config.warningTime) {
            wrapper.innerHTML = "Please set the <i>blinkingTime</i> value greater or equal than <i>warningTime</i> value for module";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (!this.loaded) {
            wrapper.innerHTML = this.translate('LOADING');
            wrapper.className = "dimmed light small";
            return wrapper;
        }

		let table = document.createElement("table");
        table.className = "small";

		let maxEntries = this.config.maxEntries;

        if (this.iBus.length > 0){
            for (let i = 0; i < this.iBus.length; ++i) {
				if (this.iBus[i].dataLines.length > 0) {
					for (let j = 0; j < this.iBus[i].dataLines.length; ++j) {
						let row = document.createElement("tr");
						table.appendChild(row);

						let lineCell = document.createElement("td");
						lineCell.innerHTML = this.iBus[i].dataLines[j].lineCode;
						row.appendChild(lineCell);

						let stopCell = document.createElement("td");
						stopCell.className = "stopName stopCell";
						stopCell.innerHTML = this.iBus[i].busStopName;
						row.appendChild(stopCell);

						let secs = this.iBus[i].dataLines[j].tInS;
						let mins = this.iBus[i].dataLines[j].tInMin;

						let timeCell = document.createElement("td");
						timeCell.className = "timeCell";
						timeCell.innerHTML = mins + " min";
						switch (true) {
							case (secs <= this.config.blinkingTime):
								timeCell.className += " arriving blinking";
								if (secs <= this.config.imminentTime) {
									timeCell.innerHTML = "imminent"
								}
								break;
							case (secs < this.config.warningTime):
								timeCell.className += " arriving";
								break;
						}
						row.appendChild(timeCell);
					}
				}else{

				}
            }
        }else{
            let row = document.createElement("tr");
            table.appendChild(row);

			let noBusCell = document.createElement("td");
            noBusCell.className = "dimmed light small";
            noBusCell.innerHTML = "No buses at this moment";
            row.appendChild(noBusCell);
        }

        return table;
    },

// ##################################################################################
// Override getHeader method
// ##################################################################################
    getHeader: function() {
        return "<i class='fa fa-fw fa-bus'></i> TMB iBus";
    },

    /* processResponse(data)
     * Uses the received data to set the various values.
     *
     */
    processResponse: function(data) {
        this.iBus = data;
        this.loaded = true;
       // this.updateDom(this.config.refreshInterval);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "STARTED") {
            this.updateDom();
        }else if (notification === "DATA") {
            this.loaded = true;
            this.processResponse(payload);
            this.updateDom();
        }
    },
})
