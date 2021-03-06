var makeTest = require('./context')
var Bottleneck = require('../lib/index.js')
var assert = require('assert')

describe('General', function () {

  it('Should return the nbQueued with and without a priority value', function (done) {
    var c = makeTest(1, 250)

    assert(c.limiter.nbQueued() === 0)

    c.limiter.submit(c.job, null, 1, c.noErrVal(1))
    assert(c.limiter.nbQueued() === 0) // It's already running

    c.limiter.submit(c.job, null, 2, c.noErrVal(2))
    assert(c.limiter.nbQueued() === 1)
    assert(c.limiter.nbQueued(1) === 0)
    assert(c.limiter.nbQueued(5) === 1)

    c.limiter.submit(c.job, null, 3, c.noErrVal(3))
    assert(c.limiter.nbQueued() === 2)
    assert(c.limiter.nbQueued(1) === 0)
    assert(c.limiter.nbQueued(5) === 2)

    c.limiter.submit(c.job, null, 4, c.noErrVal(4))
    assert(c.limiter.nbQueued() === 3)
    assert(c.limiter.nbQueued(1) === 0)
    assert(c.limiter.nbQueued(5) === 3)

    c.limiter.submitPriority(1, c.job, null, 5, c.noErrVal(5))
    assert(c.limiter.nbQueued() === 4)
    assert(c.limiter.nbQueued(1) === 1)
    assert(c.limiter.nbQueued(5) === 3)

    c.last(function (err, results) {
      assert(c.limiter.nbQueued() === 0)
      c.checkResultsOrder([1,5,2,3,4])
      c.checkDuration(1000)
      assert(c.asserts() === 10)
      done()
    })
  })

  it('Should return the nbRunning', function (done) {
    var c = makeTest(2, 250)

    assert(c.limiter.nbRunning() === 0)

    c.limiter.submit(c.job, null, 1, c.noErrVal(1))
    assert(c.limiter.nbRunning() === 1)

    setTimeout(function () {
      assert(c.limiter.nbRunning() === 0)
      setTimeout(function () {
        c.limiter.submit(c.job, null, 1, c.noErrVal(1))
        c.limiter.submit(c.job, null, 2, c.noErrVal(2))
        c.limiter.submit(c.job, null, 3, c.noErrVal(3))
        c.limiter.submit(c.job, null, 4, c.noErrVal(4))
        assert(c.limiter.nbRunning() === 2)
        done()
      }, 0)
    }, 0)
  })

  describe('Events', function () {
    it('Should fire events on empty queue', function (done) {
      var c = makeTest(1, 250)
      var calledEmpty = 0
      var calledIdle = 0

      c.limiter.on('empty', function () { calledEmpty++ })
      c.limiter.on('idle', function () { calledIdle++ })

      c.pNoErrVal(c.limiter.schedule(c.promise, null, 1), 1)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 2), 2)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 3), 3)
      c.limiter.on('idle', function () {
        c.limiter.removeAllListeners()
        c.last(function (err, results) {
          c.checkResultsOrder([1,2,3])
          c.checkDuration(500)
          assert(calledEmpty === 2)
          assert(calledIdle === 1)
          done()
        })
      })
    })

    it('Should fire events when calling stopAll() (sync)', function (done) {
      var c = makeTest(1, 250)
      var calledEmpty = 0
      var calledIdle = 0
      var calledDropped = 0

      c.limiter.on('empty', function () { calledEmpty++ })
      c.limiter.on('idle', function () { calledIdle++ })
      c.limiter.on('dropped', function () { calledDropped++ })

      c.pNoErrVal(c.limiter.schedule(c.promise, null, 1), 1)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 2), 2)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 3), 3)

      c.limiter.stopAll()
      setTimeout(function () {
        assert(calledEmpty === 2)
        assert(calledDropped === 2)
        assert(calledIdle === 0)
        done()
      }, 30)
    })

    it('Should fire events when calling stopAll() (async)', function (done) {
      var c = makeTest(1, 250)
      var calledEmpty = 0
      var calledDropped = 0
      var failedPromise = 0
      var failedCb = 0

      c.limiter.on('empty', function () { calledEmpty++ })
      c.limiter.on('dropped', function (dropped) {
        assert(dropped.args.length === 2)
        calledDropped++
      })

      c.pNoErrVal(c.limiter.schedule(c.promise, null, 1), 1)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 2), 2)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 3), 3)

      setTimeout(function () {
        c.limiter.stopAll(true)

        c.limiter.schedule(c.promise, null, 4)
        .then(() => assert(false))
        .catch(function (err) {
          assert(err.message === 'This limiter is stopped')
          failedPromise++
        })

        c.limiter.submit(c.job, null, 5, function (err) {
          assert(err.message === 'This limiter is stopped')
          failedCb++
        })
      }, 0)

      setTimeout(function () {
        assert(calledEmpty === 2)
        assert(calledDropped >= 2)
        assert(failedPromise === 1)
        assert(failedCb === 1)
        done()
      }, 50)
    })

    it('Should fail (with BottleneckError) when rejectOnDrop is true', function (done) {
      var c = makeTest(1, 250, 1, undefined, true)
      var dropped = false
      var checkedError = false

      c.limiter.on('dropped', function () {
        dropped = true
        if (dropped && checkedError) {
          done()
        }
      })

      c.limiter.submit(c.job, null, 1, c.noErrVal(1))

      c.limiter.submit(c.job, null, 2, function (err) {
        assert(err instanceof Bottleneck.BottleneckError)
        assert(err.message == 'This job has been dropped by Bottleneck')
        checkedError = true
        if (dropped && checkedError) {
          done()
        }
      })

      c.limiter.submit(c.job, null, 3, c.noErrVal(3))
    })
  })

  describe('High water limit', function () {
    it('Should support highWater set to 0', function (done) {
      var c = makeTest(1, 250, 0)

      c.pNoErrVal(c.limiter.schedule(c.promise, null, 1), 1)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 2), 2)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 3), 3)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 4), 4)
      c.limiter.changeSettings(null, null, -1)
      c.last(function (err, results) {
        c.checkDuration(0)
        c.checkResultsOrder([1])
        assert(c.asserts() === 1)
        done()
      })
    })

    it('Should support highWater set to 1', function (done) {
      var c = makeTest(1, 250, 1)

      c.pNoErrVal(c.limiter.schedule(c.promise, null, 1), 1)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 2), 2)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 3), 3)
      c.pNoErrVal(c.limiter.schedule(c.promise, null, 4), 4)
      c.limiter.changeSettings(undefined, undefined, -1)
      c.last(function (err, results) {
        c.checkDuration(250)
        c.checkResultsOrder([1,4])
        assert(c.asserts() === 2)
        done()
      })
    })
  })
})