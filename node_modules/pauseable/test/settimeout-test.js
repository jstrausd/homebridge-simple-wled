var p      = require('..');
var assert = require('assert');
var sinon  = require('sinon');


describe('setTimeout', function() {
  it('Calls given function after some time', function(done) {
    var callback = sinon.spy();
    var timeout = p.setTimeout(callback, 100);

    setTimeout(function() {
      assert.ok(callback.called);
      assert.ok(!timeout.isPaused());
      assert.ok(timeout.isDone());
      done();
    }, 105);
  });

  describe('Pause', function() {
    var callback = sinon.spy();
    var timeout;

    it('Does not call function', function(done) {
      timeout = p.setTimeout(callback, 200);

      setTimeout(function() {
        timeout.pause();
        var next = timeout.next();
        assert.ok(next > 50 && next <= 100);

        setTimeout(function() {
          assert.ok(!callback.called);
          assert.ok(timeout.isPaused());
          assert.ok(!timeout.isDone());
          assert.equal(timeout.next(), next);
          done();
        }, 100);
      }, 100);
    });

    describe('Resume after some time', function() {
      it('Calls function', function(done) {
        timeout.resume();
        assert.ok(timeout.next() < 200);
        timeout.pause();
        assert.ok(timeout.next() < 200);
        timeout.resume();
        assert.ok(timeout.next() < 200);

        setTimeout(function() {
          assert.ok(callback.called);
          assert.ok(!timeout.isPaused());
          assert.ok(timeout.isDone());
          done();
        }, 150);
      });
    });

  });

  describe('Pause for some time', function() {
    var callback = sinon.spy();
    var timeout;

    it('Does not call function in time', function() {
      timeout = p.setTimeout(callback, 100);
      timeout.pause(200);

      assert.ok(!callback.called);
      assert.ok(timeout.isPaused());
      assert.ok(!timeout.isDone());
    });

    it('Calls function after resumed again', function(done) {
      setTimeout(function() {
        assert.ok(callback.called);
        assert.ok(!timeout.isPaused());
        assert.ok(timeout.isDone());
        done();
      }, 350);
    });
  });

  describe('interchangeableArguments', function() {
    var callback = sinon.spy();
    var timeout = p.setTimeout(30, callback);

    it('Still calls function', function(done) {
      setTimeout(function() {
        assert.ok(callback.called);
        assert.ok(timeout.isDone());
        done();
      }, 35);
    });
  });

  describe('OnDone', function() {
    var callback = sinon.spy();
    var ondone = sinon.spy();
    var timeout = p.setTimeout(callback, 100);
    timeout.onDone(ondone);

    it('Function passed to onDone is called when done', function(done) {
      setTimeout(function() {
        assert.ok(callback.called);
        assert.ok(ondone.called);
        done();
      }, 105);
    });
  });

});
