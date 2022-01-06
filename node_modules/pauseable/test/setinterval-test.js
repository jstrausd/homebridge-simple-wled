var p      = require('..');
var assert = require('assert');
var sinon  = require('sinon');


describe('setInterval', function() {
  var callback = sinon.spy();
  var interval;

  it('Calls given function on interval', function(done) {
    interval = p.setInterval(callback, 100);

    setTimeout(function() {
      assert.equal(callback.callCount, 1);
      done();
    }, 105);
  });

  describe('Pause for a given time', function() {
    it('Does not call given function since it was paused', function(done) {
      interval.pause(50);
      var next = interval.next();
      assert.ok(next >= 0 && next < 100);

      setTimeout(function() {
        assert.ok(interval.isPaused());
        assert.equal(interval.next(), next);
      }, 10);

      // callback call count is still 1 because interval was paused
      setTimeout(function() {
        assert.equal(callback.callCount, 1);
        assert.ok(!interval.isPaused());
        assert.ok(!interval.isDone());
        done();
      }, 100); // this will be called after `done` is called on the parent
    });

    it('Eventually resumes and keeps calling function', function(done) {
      setTimeout(function() {
        interval.clear();
        assert.equal(callback.callCount, 2);
        assert.ok(!interval.isPaused());
        assert.ok(interval.isDone());
        done();
      }, 75);
    });

    it('Does not call again after being cleared', function(done) {
      setTimeout(function() {
        assert.equal(callback.callCount, 2);
        assert.ok(interval.isDone());
        done();
      }, 100);
    });

  });

  describe('Clear right after resuming', function() {
    it('Does not call given function at all', function(done) {
      var callback = sinon.spy();
      var interval = p.setInterval(callback, 10);

      setTimeout(function() {
        assert.equal(callback.callCount, 1);
        interval.pause();
        interval.resume();
        interval.clear();

        setTimeout(function() {
          assert.equal(callback.callCount, 1);
          done();
        }, 50);
      }, 15);
    });
  });
});
