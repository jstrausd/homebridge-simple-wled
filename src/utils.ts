const axios = require('axios').default;

export function httpSendData(url: string, method: string, data: object, callback: Function): void {
    if (method.toLowerCase() == "post") {
        axios.post(String(url), data)
            .then(function (response: any) {
                callback(null, response)
            })
            .catch(function (error: any) {
                callback(error, null)
            });
    } else if (method.toLowerCase() == "get") {
        axios.get(url)
            .then(function (response: any) {
                callback(null, response)
            })
            .catch(function (error: any) {
                callback(error, null)
            })
    }
}

export async function loadEffects(hosts:any): Promise<Array<string>> {
    return new Promise((resolve, reject) => {
        let host:string;
        if(hosts instanceof Array){
            host = hosts[0];
        }else{
            host = hosts;
        }
        httpSendData(`http://${host}/json/effects`, "GET", {}, (error: any, response: any) => {
          if (error) { console.log(`Error while loading all effects on ${host}`); reject(); };
          console.log("Loaded all effects!");
          resolve(response.data);
        })
    });
  }