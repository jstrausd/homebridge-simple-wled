var pollingtoevent = require(".."),
  request = require("request");

var url = "https://raw.githubusercontent.com/mozilla/contribute.json/master/schema.json";

emitter = pollingtoevent(function(done) {
  request.get(url, function(err, req, data) {
    done(err, data);
  });
});

emitter.on("poll", function(data) {
  console.log("Event emitted at %s, with data %j", Date.now(), data);
});

setTimeout(function() {
  emitter.pause();
  console.log("Pausing polling");
  setTimeout(function() {
    emitter.resume();
    console.log("Resuming polling");
  }, 4000);
}, 4000);

emitter.on("error", function(err, data) {
  console.log("Emitter errored: %s. with data %j", err, data);
});
