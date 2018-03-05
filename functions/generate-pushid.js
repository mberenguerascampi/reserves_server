/**
 * Fancy ID generator that creates 10-character string identifiers with the following properties:
 *
 * 1. They're based on timestamp so that they sort *after* any existing ids.
 * 2. They contain 72-bits of random data after the timestamp so that IDs won't collide with other clients' IDs.
 * 3. They sort *lexicographically* (so the timestamp is converted to characters that will sort properly).
 * 4. They're monotonically increasing.  Even if you generate more than one in the same timestamp, the
 *    latter ones will sort after the former ones.  We do this by using the previous random bits
 *    but "incrementing" them by 1 (only in the case of a timestamp collision).
 */
  // Modeled after base64 web-safe chars, but ordered by ASCII.
  var PUSH_CHARS = '123456789';

  // Timestamp of last push, used to prevent local collisions if you push twice in one ms.
  var lastPushTime = 0;

  // We generate 72-bits of randomness which get turned into 12 characters and appended to the
  // timestamp to prevent collisions with other clients.  We store the last characters we
  // generated because in the event of a collision, we'll use those same characters except
  // "incremented" by one.
  var lastRandChar = -1;

exports.generatePushID = function() {
    var now = new Date().getTime();
    var duplicateTime = (now === lastPushTime);
    lastPushTime = now;

    var timeStampChars = new Array(8);
    for (var i = 0; i < 9; ++i) { //Fins a 9 per arribar al dia => ms a s (3) + s a min (2) + min a h (2) + h a d (2)
      timeStampChars[i] = PUSH_CHARS.charAt(now % 9);
      // NOTE: Can't use << here because javascript will convert to int and lose the upper bits.
      now = Math.floor(now / 9);
    }
    //if (now !== 0) throw new Error('We should have converted the entire timestamp.');

    var id = timeStampChars.join('');

    if (!duplicateTime) {
      lastRandChar = Math.floor(Math.random() * 9);
    } else {
      lastRandChar = (lastRandChar + 1) %9;
    }

    id += PUSH_CHARS.charAt(lastRandChar);
    
    if(id.length != 10) throw new Error('Length should be 10.');

    return id;
  };