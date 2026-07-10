# Celebrity Threshold

Default threshold: 10,000 followers.

Reason:
- Avoid expensive fan-out for high-follower accounts.
- Push is efficient for normal users.
- Pull scales better for celebrities.
- Threshold is configurable in feed.config.js.
