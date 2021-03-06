import { blank } from 'helpers/qunit-helpers';
import DiscourseURL from "discourse/lib/url";
import ClickTrack from "discourse/lib/click-track";

var windowOpen,
    win,
    redirectTo;

module("lib:click-track", {
  setup: function() {
    // Prevent any of these tests from navigating away
    win = {focus: function() { } };
    redirectTo = sandbox.stub(DiscourseURL, "redirectTo");
    windowOpen = sandbox.stub(window, "open").returns(win);
    sandbox.stub(win, "focus");

    sessionStorage.clear();

    fixture().html(
      `<div id="topic" data-topic-id="1337">
        <article data-post-id="42" data-user-id="3141">
          <a href="http://www.google.com">google.com</a>
          <a class="lightbox back quote-other-topic" href="http://www.google.fr">google.fr</a>
          <a id="with-badge" data-user-id="314" href="http://www.google.de">google.de<span class="badge">1</span></a>
          <a id="with-badge-but-not-mine" href="http://www.google.es">google.es<span class="badge">1</span></a>
          <div class="onebox-result">
            <a id="inside-onebox" href="http://www.google.co.uk">google.co.uk<span class="badge">1</span></a>
            <a id="inside-onebox-forced" class="track-link" href="http://www.google.at">google.at<span class="badge">1</span></a>
          </div>
          <a class="no-track-link" href="http://www.google.com.br">google.com.br</a>
          <a id="same-site" href="http://discuss.domain.com">forum</a>
          <a class="attachment" href="http://discuss.domain.com/uploads/default/1234/1532357280.txt">log.txt</a>
          <a class="hashtag" href="http://discuss.domain.com">#hashtag</a>
          <a class="mailto" href="mailto:foo@bar.com">email-me</a>
          <aside class="quote">
            <a class="inside-quote" href="http://discuss.domain.com">foobar</a>
          </aside>
        </article>
      </div>`);
  }
});

var track = ClickTrack.trackClick;

// test
var generateClickEventOn = function(selector) {
  return $.Event("click", { currentTarget: fixture(selector)[0] });
};

test("does not track clicks on lightboxes", function() {
  var clickEvent = generateClickEventOn('.lightbox');
  sandbox.stub(clickEvent, "preventDefault");
  ok(track(clickEvent));
  ok(!clickEvent.preventDefault.calledOnce);
});

test("it calls preventDefault when clicking on an a", function() {
  var clickEvent = generateClickEventOn('a');
  sandbox.stub(clickEvent, "preventDefault");
  track(clickEvent);
  ok(clickEvent.preventDefault.calledOnce);
  ok(DiscourseURL.redirectTo.calledOnce);
});

test("does not track clicks when forcibly disabled", function() {
  ok(track(generateClickEventOn('.no-track-link')));
});

test("does not track clicks on back buttons", function() {
  ok(track(generateClickEventOn('.back')));
});

test("does not track clicks in quotes", function() {
  ok(track(generateClickEventOn('.inside-quote')));
});

test("does not track clicks on quote buttons", function() {
  ok(track(generateClickEventOn('.quote-other-topic')));
});

test("does not track clicks on category badges", () => {
  ok(track(generateClickEventOn('.hashtag')));
});

test("does not track clicks on mailto", function() {
  ok(track(generateClickEventOn('.mailto')));
});

test("removes the href and put it as a data attribute", function() {
  track(generateClickEventOn('a'));

  var $link = fixture('a').first();
  ok($link.hasClass('no-href'));
  equal($link.data('href'), 'http://www.google.com');
  blank($link.attr('href'));
  ok($link.data('auto-route'));
  ok(DiscourseURL.redirectTo.calledOnce);
});

asyncTestDiscourse("restores the href after a while", function() {
  expect(1);

  track(generateClickEventOn('a'));

  setTimeout(function() {
    start();
    equal(fixture('a').attr('href'), "http://www.google.com");
  }, 75);
});

var badgeClickCount = function(id, expected) {
  track(generateClickEventOn('#' + id));
  var $badge = $('span.badge', fixture('#' + id).first());
  equal(parseInt($badge.html(), 10), expected);
};

test("does not update badge clicks on my own link", function() {
  sandbox.stub(Discourse.User, 'currentProp').withArgs('id').returns(314);
  badgeClickCount('with-badge', 1);
});

test("does not update badge clicks in my own post", function() {
  sandbox.stub(Discourse.User, 'currentProp').withArgs('id').returns(3141);
  badgeClickCount('with-badge-but-not-mine', 1);
});

test("updates badge counts correctly", function() {
  badgeClickCount('inside-onebox', 1);
  badgeClickCount('inside-onebox-forced', 2);
  badgeClickCount('with-badge', 2);
});

var trackRightClick = function() {
  var clickEvent = generateClickEventOn('a');
  clickEvent.which = 3;
  return track(clickEvent);
};

test("right clicks change the href", function() {
  ok(trackRightClick());
  equal(fixture('a').first().prop('href'), "http://www.google.com/");
});

test("right clicks are tracked", function() {
  Discourse.SiteSettings.track_external_right_clicks = true;
  trackRightClick();
  equal(fixture('a').first().attr('href'), "/clicks/track?url=http%3A%2F%2Fwww.google.com&post_id=42&topic_id=1337");
});

test("preventDefault is not called for right clicks", function() {
  var clickEvent = generateClickEventOn('a');
  clickEvent.which = 3;
  sandbox.stub(clickEvent, "preventDefault");
  ok(track(clickEvent));
  ok(!clickEvent.preventDefault.calledOnce);
});

var testOpenInANewTab = function(description, clickEventModifier) {
  test(description, function() {
    var clickEvent = generateClickEventOn('a');
    clickEventModifier(clickEvent);
    sandbox.stub(clickEvent, "preventDefault");
    ok(track(clickEvent));
    ok(!clickEvent.preventDefault.calledOnce);
  });
};

testOpenInANewTab("it opens in a new tab when pressing shift", function(clickEvent) {
  clickEvent.shiftKey = true;
});

testOpenInANewTab("it opens in a new tab when pressing meta", function(clickEvent) {
  clickEvent.metaKey = true;
});

testOpenInANewTab("it opens in a new tab when pressing ctrl", function(clickEvent) {
  clickEvent.ctrlKey = true;
});

testOpenInANewTab("it opens in a new tab on middle click", function(clickEvent) {
  clickEvent.button = 2;
});

test("tracks via AJAX if we're on the same site", function() {
  sandbox.stub(DiscourseURL, "routeTo");
  sandbox.stub(DiscourseURL, "origin").returns("http://discuss.domain.com");

  ok(!track(generateClickEventOn('#same-site')));
  ok(DiscourseURL.routeTo.calledOnce);
});

test("does not track via AJAX for attachments", function() {
  sandbox.stub(DiscourseURL, "routeTo");
  sandbox.stub(DiscourseURL, "origin").returns("http://discuss.domain.com");

  ok(!track(generateClickEventOn('.attachment')));
  ok(DiscourseURL.redirectTo.calledOnce);
});

test("tracks custom urls when opening in another window", function() {
  var clickEvent = generateClickEventOn('a');
  sandbox.stub(Discourse.User, "currentProp").withArgs('external_links_in_new_tab').returns(true);
  ok(!track(clickEvent));
  ok(windowOpen.calledWith('/clicks/track?url=http%3A%2F%2Fwww.google.com&post_id=42&topic_id=1337', '_blank'));
});

test("tracks custom urls when opening in another window", function() {
  var clickEvent = generateClickEventOn('a');
  ok(!track(clickEvent));
  ok(redirectTo.calledWith('/clicks/track?url=http%3A%2F%2Fwww.google.com&post_id=42&topic_id=1337'));
});
