"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEffects = exports.httpSendData = void 0;
const axios = require('axios').default;
function httpSendData(url, method, data, callback) {
    if (method.toLowerCase() == "post") {
        axios.post(String(url), data)
            .then(function (response) {
            callback(null, response);
        })
            .catch(function (error) {
            callback(error, null);
        });
    }
    else if (method.toLowerCase() == "get") {
        axios.get(url)
            .then(function (response) {
            callback(null, response);
        })
            .catch(function (error) {
            callback(error, null);
        });
    }
}
exports.httpSendData = httpSendData;
async function loadEffects(hosts) {
    return new Promise((resolve, reject) => {
        let host;
        if (hosts instanceof Array) {
            host = hosts[0];
        }
        else {
            host = hosts;
        }
        httpSendData(`http://${host}/json/effects`, "GET", {}, (error, response) => {
            if (error || response == null) {
                return reject(`Error while loading all effects on ${host}`);
            }
            ;
            console.log(`Loaded all effects for ${host}`);
            resolve(response.data);
        });
    });
}
exports.loadEffects = loadEffects;
//# sourceMappingURL=utils.js.map