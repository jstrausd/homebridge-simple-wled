var pollingtoevent = require(".."),
  request = require("request");

var url = "https://raw.githubusercontent.com/mozilla/contribute.json/master/schema.json";

emitter = pollingtoevent(function(done) {
  request.get(url, function(err, req, data) {
    done(err, data);
  });
}, {
  longpolling: true
});

emitter.on("longpoll", function(data) {
  console.log("longpoll emitted at %s, with data %j", Date.now(), data);
});

emitter.on("error", function(err) {
  console.log("Emitter errored: %s. with", err);
});