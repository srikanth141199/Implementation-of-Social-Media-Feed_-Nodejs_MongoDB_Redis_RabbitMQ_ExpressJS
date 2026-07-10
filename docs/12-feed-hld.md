# docs/12-feed-hld.md

# Designing Twitter / Instagram Feed

## High Level Design (HLD)

**Assignment 12 Capstone**

**Author:** Srikanth K

---

# Table of Contents

1. Introduction
2. Functional Requirements
3. Non Functional Requirements
4. High Level Architecture
5. System Components
6. POST /post Lifecycle
7. GET /feed Lifecycle
8. Feed Generation Strategies
9. Push vs Pull vs Hybrid
10. Cache Design
11. Queue Design
12. Database Design
13. Sharding Strategy
14. Replication
15. Ranking System
16. Failure Handling
17. Trade-offs
18. Performance
19. Future Improvements
20. Conclusion

---

# 1. Introduction

Modern social media applications such as Twitter (X), Instagram, Facebook, LinkedIn, and Reddit serve personalized feeds to hundreds of millions of users every day. A feed system must provide fresh, relevant content with very low latency while handling enormous write and read traffic.

This project designs a scalable feed generation architecture capable of supporting millions of users by combining caching, asynchronous messaging, database sharding, replication, and hybrid fan-out strategies.

The architecture is designed around the following principles:

* Low read latency
* Horizontal scalability
* High availability
* Fault tolerance
* Configurable ranking
* Efficient resource utilization

---

# 2. Functional Requirements

The system must support the following functionality:

### User Features

* Register and login
* Follow or unfollow users
* Create posts
* Like posts
* View personalized feeds

### Feed Features

* Pull feed generation
* Push feed generation
* Hybrid feed generation
* Ranked feed
* Chronological feed
* Top 20 posts

---

# 3. Non Functional Requirements

The system should satisfy several quality attributes.

### Scalability

Support

* 100 Million users
* 10 Million DAU
* Millions of requests per minute

---

### Availability

Target uptime

```text
99.99%
```

---

### Latency

Desired API latency

| API        | Target  |
| ---------- | ------- |
| POST /post | <100 ms |
| GET /feed  | <50 ms  |

---

### Reliability

* No message loss
* Durable queues
* Retry mechanisms
* Dead Letter Queue

---

### Security

* JWT Authentication
* Password hashing
* HTTPS
* Rate limiting

---

# 4. High Level Architecture

```text
                                 Internet
                                     |
                              API Gateway
                                     |
                   +-----------------+----------------+
                   |                                  |
             Authentication                    Rate Limiter
                   |                                  |
                   +---------------+------------------+
                                   |
                           Load Balancer
                                   |
              +---------+----------+----------+
              |         |                     |
        App Server 1 App Server 2      App Server N
              |         |                     |
              +---------+----------+----------+
                                   |
          +------------------------+------------------------+
          |                        |                        |
          |                        |                        |
      Redis Cache            RabbitMQ Queue          MongoDB Cluster
          |                        |                        |
          |                    Feed Workers          Config Servers
          |                        |                        |
          |                        |                 -----------------
          |                        |                 |       |       |
          |                  Fan-out Service      Shard1 Shard2 Shard3
          |                                          |       |       |
          |                                      Primary Replica Replica
          |
      Feed Response
```

---

# Architecture Explanation

The architecture consists of several independent services.

## API Gateway

Responsibilities:

* Receives all requests
* SSL termination
* Authentication forwarding
* Routing
* Request logging

---

## Authentication Service

Responsibilities

* JWT verification
* User identification
* Session validation

---

## Rate Limiter

Protects APIs from abuse.

Example

```
100 requests/minute
```

per user.

---

## Application Servers

Responsible for

* Business logic
* Feed APIs
* Post APIs
* Ranking
* Cache lookup

Multiple application servers enable horizontal scaling.

---

## Redis

Stores

```
feed:userId
```

for extremely fast feed retrieval.

Read latency is typically under 2 milliseconds.

---

## RabbitMQ

Handles asynchronous processing.

Instead of writing millions of feed entries inside the request thread, work is delegated to workers.

Benefits

* Loose coupling
* Reliability
* Scalability

---

## Feed Workers

Workers consume messages from RabbitMQ.

Responsibilities

* Find followers
* Write feed cache
* Retry failures
* Dead Letter Queue

---

## MongoDB Cluster

Stores

* Users
* Posts
* Likes
* Followers

MongoDB is horizontally sharded.

---

# Data Storage

```
Users Collection

Posts Collection

Follows Collection

Likes Collection
```

---

# Sharding

Users are distributed using

```
Hash(UserID)
```

Example

```
User 1

↓

Shard A

User 2

↓

Shard C

User 3

↓

Shard B
```

Benefits

* Balanced storage
* Horizontal scalability

---

# Replication

Each shard contains

```
Primary

↓

Secondary

↓

Secondary
```

Advantages

* High availability
* Read scaling
* Disaster recovery

# 5. Request Lifecycle

A feed system mainly consists of two important APIs.

```
POST /post
```

and

```
GET /feed
```

Although these APIs appear simple to the user, they trigger many distributed system components behind the scenes.

---

# 5.1 POST /post Lifecycle

When a user publishes a post, the system should:

* Store the post safely.
* Return success quickly.
* Update millions of followers efficiently.
* Avoid blocking the user.

Instead of updating every follower synchronously, the system stores the post first and delegates feed generation to asynchronous workers.

---

## Complete Flow

```text
                   User
                     |
             POST /post
                     |
             API Gateway
                     |
          JWT Authentication
                     |
            Rate Limiter
                     |
              App Server
                     |
         Validate Request
                     |
             Save Post
                     |
             MongoDB Primary
                     |
          Publish Message
               RabbitMQ
                     |
      Return 201 Created
                     |
          --------------------
                     |
             Feed Worker
                     |
          Read Followers
                     |
          Fan-out Service
                     |
     +---------------+---------------+
     |               |               |
 Redis Feed A   Redis Feed B   Redis Feed C
```

---

## Step-by-Step Explanation

### Step 1

User creates a post.

Example

```http
POST /post
```

Body

```json
{
   "content":"Hello World"
}
```

---

### Step 2

API Gateway receives the request.

Responsibilities

* SSL termination
* Routing
* Logging

---

### Step 3

Authentication

JWT token is verified.

If invalid

```
401 Unauthorized
```

---

### Step 4

Rate Limiter

Example

```
100 requests/minute
```

If exceeded

```
429 Too Many Requests
```

---

### Step 5

Business Validation

Application server validates

* content length
* profanity (optional)
* media size
* permissions

---

### Step 6

Store Post

```
MongoDB

Posts Collection
```

Document

```
_id

author

content

createdAt

likes
```

---

### Step 7

Publish Queue Message

Instead of updating millions of feeds immediately,

the server publishes

```
PostCreated
```

event.

Example

```json
{
    "event":"PostCreated",
    "postId":"123",
    "author":"100"
}
```

---

### Step 8

Return Response

The user immediately receives

```
201 Created
```

Response time

Usually

```
20-60 ms
```

---

### Step 9

RabbitMQ

RabbitMQ stores the event safely until workers consume it.

Multiple workers can process events simultaneously.

---

### Step 10

Feed Worker

Worker receives

```
PostCreated
```

Worker

* gets follower list
* creates feed entries
* updates Redis

---

## Fan-out Process

```
Post

↓

Followers

↓

User 1

↓

Redis Feed

----------------

User 2

↓

Redis Feed

----------------

User 3

↓

Redis Feed
```

This process happens asynchronously.

The original user does not wait.

---

# Why Queue?

Without RabbitMQ

```
Create Post

↓

Update 1 Million Feeds

↓

Return Response
```

Response could take seconds.

---

With RabbitMQ

```
Create Post

↓

Store

↓

Queue

↓

Return Immediately

↓

Background Workers
```

Much faster.

---

# 5.2 GET /feed Lifecycle

When a user opens the application,

the feed service must provide

```
Top 20 posts
```

as quickly as possible.

---

## Complete Flow

```text
                  User
                    |
              GET /feed
                    |
              API Gateway
                    |
           JWT Authentication
                    |
             Rate Limiter
                    |
              App Server
                    |
        Check Redis Feed Cache
             /              \
            /                \
         HIT                  MISS
         |                     |
Return Cached Feed      Query MongoDB
                              |
                     Get Following List
                              |
                      Fetch Latest Posts
                              |
                        Merge Results
                              |
                      Store In Redis
                              |
                       Ranking Engine
                              |
                       Return Feed
```

---

# Cache Hit

Suppose

```
feed:100
```

already exists.

The API performs

```
Redis

↓

LRANGE

↓

Return Feed
```

Typical latency

```
1-2 ms
```

---

# Cache Miss

Suppose

Redis does not contain

```
feed:100
```

The application

1. reads following list

2. queries MongoDB

3. merges posts

4. sorts

5. updates Redis

6. returns feed

---

# Pull Model

```
User

↓

Following List

↓

Posts Database

↓

Merge

↓

Sort

↓

Return
```

Advantages

* Small storage
* No duplicated feeds

Disadvantages

* Slow reads

---

# Push Model

```
Create Post

↓

RabbitMQ

↓

Workers

↓

Redis Feed

↓

GET Feed

↓

Instant Response
```

Advantages

* Very fast reads

Disadvantages

* Large write cost

---

# Hybrid Model

The system dynamically decides.

```
Followers

↓

< Threshold ?

↓

YES

↓

Push

---------------

NO

↓

Pull
```

Threshold

```
10,000 followers
```

Example

| User        | Followers | Strategy |
| ----------- | --------: | -------- |
| Alice       |       350 | Push     |
| Bob         |     4,500 | Push     |
| Celebrity X | 2,000,000 | Pull     |

---

# Feed Merge

For hybrid feeds

```
Redis Feed

+

Celebrity Posts

↓

Merge

↓

Sort

↓

Ranking

↓

Top 20

↓

Return
```

This gives users one seamless timeline while avoiding millions of unnecessary writes for celebrity accounts.

---

# Why Hybrid?

Imagine a celebrity with

```
50 Million followers
```

Every post would require

```
50 Million Redis Writes
```

This is extremely expensive.

Instead

```
Store Post Once

↓

Read Later

↓

Merge During GET /feed
```

The system saves enormous infrastructure cost while maintaining good read performance.

---

## End-to-End Sequence Diagram

```text
User
 |
 | POST /post
 |
API Gateway
 |
Auth
 |
Rate Limiter
 |
App Server
 |
MongoDB (Save Post)
 |
RabbitMQ
 |
201 Created -----------------------------> User
 |
Feed Worker
 |
Followers Service
 |
Redis Feed Cache


Later...

User
 |
GET /feed
 |
API Gateway
 |
Auth
 |
Redis Cache ---------+
 |                    |
 | Cache Miss         |
 |                    |
MongoDB              |
 |                    |
Merge Feed <----------+
 |
Ranking Engine
 |
Top 20 Feed
 |
User
```

# 6. How Caching, Queueing, Sharding and Replication Interact in the Feed Path

One of the biggest challenges in designing a large-scale social media feed is ensuring that millions of users can read and write data simultaneously without overloading the database. A single technology cannot solve this problem. Instead, the system combines **Redis (Caching)**, **RabbitMQ (Queueing)**, **MongoDB Sharding**, and **Replication** to build a scalable and fault-tolerant architecture.

Each component has a specific responsibility, and together they provide high throughput, low latency, and high availability.

---

# Overall Data Flow

```text
                           User
                             |
                     POST /post
                             |
                      API Gateway
                             |
                      Authentication
                             |
                       Application API
                             |
          +------------------+------------------+
          |                                     |
      Store Post                         Publish Event
          |                                     |
      MongoDB Primary --------------------> RabbitMQ
          |                                     |
          |                              Feed Workers
          |                                     |
          |                             Find Followers
          |                                     |
          |                             Update Redis Feed
          |                                     |
          +------------------+------------------+
                             |
                        GET /feed
                             |
                     Check Redis Cache
                       /            \
                  Cache Hit      Cache Miss
                     |               |
              Return Feed      Query MongoDB
                     |               |
                     +-------Merge----+
                             |
                      Ranking Service
                             |
                        Return Feed
```

---

# Role of Redis Cache

Redis is used to store precomputed feeds for users.

Instead of querying MongoDB every time a user opens the application, the feed is served directly from Redis whenever possible.

Each user's feed is stored using a key similar to:

```
feed:<userId>
```

Example

```
feed:1001

↓

Post 1

Post 2

Post 3

Post 4
```

When the user requests their feed, the application first checks Redis.

If the feed exists, the response is returned immediately without accessing MongoDB.

This significantly reduces database load and improves response time.

Typical latency:

* Redis Read: 1–2 ms
* MongoDB Query: 20–100 ms

---

# Cache Hit

A cache hit occurs when Redis already contains the requested feed.

Flow

```text
GET /feed

↓

Redis

↓

Feed Found

↓

Return Feed
```

Advantages

* Extremely fast response
* No database query
* Low CPU utilization
* Better user experience

---

# Cache Miss

A cache miss occurs when the feed does not exist in Redis.

Flow

```text
GET /feed

↓

Redis

↓

Feed Not Found

↓

MongoDB

↓

Generate Feed

↓

Store in Redis

↓

Return Feed
```

Although slower than a cache hit, storing the generated feed back into Redis ensures that future requests become much faster.

---

# Cache Expiration Strategy

Feeds should not remain in Redis forever.

Possible strategies include:

* Time-To-Live (TTL) of a few minutes
* Updating cache whenever a new post is created
* Removing inactive user feeds automatically

This prevents Redis memory from growing indefinitely while keeping frequently accessed feeds readily available.

---

# Role of RabbitMQ

Updating every follower's feed immediately inside the API request would make the response extremely slow.

Instead, RabbitMQ is used as an asynchronous message broker.

Whenever a post is created, the application publishes a **PostCreated** event.

Example

```json
{
  "event": "PostCreated",
  "postId": "123",
  "authorId": "100"
}
```

RabbitMQ stores this message until one of the feed workers processes it.

---

# Queue Processing Flow

```text
Create Post

↓

RabbitMQ Queue

↓

Feed Worker

↓

Find Followers

↓

Update Redis

↓

Acknowledgement
```

Advantages

* Faster API response
* Loose coupling
* Better scalability
* Retry support
* Reliable message delivery

---

# Feed Workers

Feed workers continuously consume messages from RabbitMQ.

Responsibilities include:

* Reading new post events
* Fetching follower lists
* Updating Redis feeds
* Logging failures
* Retrying failed operations

Since workers operate independently of the API server, the system can process thousands of feed updates in parallel.

If traffic increases, more workers can be added without changing application code.

---

# MongoDB Sharding

A single MongoDB server cannot efficiently store hundreds of millions of users and posts.

To overcome this limitation, MongoDB uses horizontal sharding.

Users are distributed across multiple shards using a shard key.

Example

```
Hash(UserId)
```

Possible distribution

```text
User 100

↓

Shard A

----------------

User 250

↓

Shard B

----------------

User 875

↓

Shard C
```

Advantages

* Horizontal scalability
* Balanced storage
* Parallel processing
* Reduced query latency

---

# Database Replication

Every shard maintains replica nodes.

Example

```text
               Primary
                  |
         -----------------
         |               |
    Secondary      Secondary
```

The primary handles write operations.

Secondary replicas continuously synchronize with the primary.

Benefits include:

* High availability
* Automatic failover
* Read scaling
* Backup support

If the primary server becomes unavailable, a secondary replica can automatically become the new primary.

---

# Interaction Between Components

The four major technologies work together as follows:

| Component      | Responsibility          |
| -------------- | ----------------------- |
| Redis          | Fast feed retrieval     |
| RabbitMQ       | Background processing   |
| MongoDB Shards | Horizontal data storage |
| Replicas       | High availability       |

None of these components replace each other.

Instead, they complement one another to create a highly scalable distributed system.

---

# End-to-End Component Interaction

```text
User Creates Post
        |
        ▼
MongoDB Stores Post
        |
        ▼
RabbitMQ Receives Event
        |
        ▼
Feed Worker Consumes Event
        |
        ▼
Follower Feeds Updated
        |
        ▼
Redis Stores Feed
        |
        ▼
User Opens Feed
        |
        ▼
Redis Returns Feed
```

---

# Benefits of Combining All Components

Using only MongoDB would overload the database during heavy read traffic.

Using only Redis would not provide durable storage.

Using only RabbitMQ would not improve read performance.

Using only replication would not reduce latency.

Combining all four technologies provides:

* Fast feed retrieval
* Reliable asynchronous processing
* Scalable storage
* High availability
* Efficient resource utilization
* Support for millions of concurrent users

# 7. Failure Modes and Mitigation Strategies

Large-scale distributed systems rarely fail because of a single component. Most failures occur when one service becomes overloaded, unavailable, or slower than expected. Therefore, the feed system must be designed to detect failures quickly and continue serving users with minimal disruption.

This section discusses common failure scenarios and the strategies used to mitigate them.

---

# 7.1 Cache Miss Storm (Cache Stampede)

## Problem

A cache miss storm occurs when many users request the same data after it has expired or been removed from Redis.

Instead of Redis serving the feed, every request reaches MongoDB simultaneously.

Example:

* 100,000 users open the application at 9:00 AM.
* Redis entries have expired.
* Every request queries MongoDB.

This creates an enormous spike in database traffic.

---

## Flow

```text id="j0tq4v"
Redis Cache Expired
          |
          ▼
Thousands of Users
          |
          ▼
Cache Miss
          |
          ▼
MongoDB Queries
          |
          ▼
Database Overload
```

---

## Mitigation

### Cache Warming

Generate popular feeds before users request them.

Example:

* Morning cache refresh
* Trending users
* Active users

---

### Random TTL

Avoid expiring every cache entry at the same time.

Instead of

```id="g9smx8"
TTL = 10 Minutes
```

Use

```id="r7h81i"
TTL = 8–12 Minutes
```

This spreads cache expiration over time.

---

### Request Coalescing

If multiple requests need the same feed:

* First request regenerates it.
* Remaining requests wait briefly.
* All receive the same cached result.

This prevents duplicate database work.

---

### Distributed Lock

Before rebuilding a feed:

```text id="c3ptmq"
Acquire Lock

↓

Generate Feed

↓

Update Redis

↓

Release Lock
```

Only one server regenerates the cache.

---

# 7.2 Queue Lag

## Problem

RabbitMQ receives posts faster than workers can process them.

Example

```text id="d4vczf"
Incoming Messages

100,000/minute

Workers

20,000/minute
```

The queue continuously grows.

Consequences:

* Delayed feed updates
* Higher memory usage
* Increased processing time

---

## Mitigation

### Add More Workers

Workers are stateless.

Scaling horizontally is simple.

```text id="ax4npv"
Worker 1

Worker 2

Worker 3

Worker 4

Worker N
```

---

### Partition Queues

Instead of one queue:

```text id="3j0mio"
Feed Queue A

Feed Queue B

Feed Queue C
```

Different workers consume different queues.

---

### Priority Queues

Critical users

Example

* Verified accounts
* Premium users

can receive higher priority processing.

---

### Dead Letter Queue (DLQ)

Messages that repeatedly fail are moved into a Dead Letter Queue.

Flow

```text id="z6s1tr"
RabbitMQ

↓

Worker Failure

↓

Retry

↓

Retry

↓

Retry

↓

Dead Letter Queue
```

The system continues processing healthy messages while problematic events are inspected later.

---

# 7.3 Hot Shard Problem

## Problem

Some users become significantly more popular than others.

Example

```text id="drd8xt"
Celebrity

50 Million Followers
```

If all data resides on one shard,

that shard becomes overloaded while other shards remain underutilized.

---

## Mitigation

### Better Shard Key

Avoid sharding by popularity.

Use

```id="r0nl9v"
Hash(UserId)
```

instead.

This distributes users evenly.

---

### Read Replicas

Popular users generate many read requests.

Replica nodes can serve read traffic while the primary handles writes.

---

### Hybrid Feed

Instead of pushing every celebrity post into millions of Redis feeds,

store only one copy in MongoDB.

Merge celebrity posts during

```id="7v40z9"
GET /feed
```

This significantly reduces write amplification.

---

# 7.4 Redis Failure

## Problem

Redis becomes unavailable.

Cache cannot be accessed.

---

## Mitigation

```text id="pylmvd"
Redis Failure

↓

Fallback

↓

MongoDB

↓

Generate Feed

↓

Return Feed
```

Although response time increases, users still receive their feed.

Redis can later rebuild automatically.

---

# 7.5 MongoDB Failure

MongoDB primary becomes unavailable.

---

## Mitigation

Replica Set performs automatic failover.

```text id="ysm5r0"
Primary

↓

Failure

↓

Secondary

↓

New Primary
```

Application reconnects automatically.

Minimal downtime.

---

# 7.6 Worker Failure

A feed worker crashes while processing messages.

---

## Mitigation

RabbitMQ does not remove the message until acknowledgement.

Flow

```text id="llx31g"
Worker

↓

Crash

↓

Message Unacknowledged

↓

RabbitMQ

↓

Another Worker

↓

Processing Continues
```

No message is lost.

---

# 7.7 Network Failure

Network interruption occurs between services.

Possible effects:

* Redis timeout
* MongoDB timeout
* RabbitMQ timeout

---

## Mitigation

* Retry mechanism
* Exponential backoff
* Circuit breaker
* Timeout configuration

Example

```text id="zzydqw"
Attempt 1

↓

Wait 1 sec

↓

Attempt 2

↓

Wait 2 sec

↓

Attempt 3
```

---

# 8. Trade-offs

Every architectural decision improves one aspect while introducing costs elsewhere.

The following table summarizes the major trade-offs.

| Decision    | Benefits                | Drawbacks                   |
| ----------- | ----------------------- | --------------------------- |
| Redis Cache | Fast reads              | Extra memory usage          |
| RabbitMQ    | Asynchronous processing | Additional infrastructure   |
| Push Feed   | Very low read latency   | High write amplification    |
| Pull Feed   | Low storage cost        | Higher read latency         |
| Hybrid Feed | Balanced scalability    | More complex implementation |
| Sharding    | Horizontal scaling      | Cross-shard complexity      |
| Replication | High availability       | Replication lag             |
| Ranking     | Better user engagement  | Additional CPU usage        |

---

# Choosing the Right Strategy

### Pull Feed

Recommended when:

* Small applications
* Limited users
* Low write traffic

---

### Push Feed

Recommended when:

* Active users
* Moderate follower counts
* Fast reads are important

---

### Hybrid Feed

Recommended when:

* Millions of users
* Celebrity accounts
* Large-scale production systems

Most modern social media platforms use a hybrid strategy because it provides the best balance between performance, storage, infrastructure cost, and scalability.


# 9. Performance Analysis

Performance is one of the most important aspects of a feed generation system. Users expect their feed to load almost instantly, even when millions of people are using the platform simultaneously. This section analyzes how different feed generation strategies perform and why the hybrid approach is preferred for large-scale systems.

---

# Performance Goals

The system is designed with the following performance objectives.

| Operation             | Target Latency |
| --------------------- | -------------: |
| User Login            |       < 100 ms |
| Create Post           |       < 100 ms |
| Get Feed (Cache Hit)  |        < 10 ms |
| Get Feed (Cache Miss) |       < 150 ms |
| Like Post             |        < 50 ms |

---

# Pull Feed Performance

In the pull model, the feed is generated every time the user opens the application.

Flow:

```text id="zq9b1n"
GET /feed
      |
      ▼
Get Following List
      |
      ▼
Fetch Posts
      |
      ▼
Merge
      |
      ▼
Sort
      |
      ▼
Return Feed
```

### Time Complexity

If:

* F = Number of followed users
* P = Number of retrieved posts

Then:

```text id="oz5g7d"
Feed Query

O(F + P log P)
```

As the number of followed users increases, response time also increases.

---

# Push Feed Performance

In the push model, feeds are precomputed whenever a post is created.

Flow:

```text id="cfi4vz"
POST /post
      |
      ▼
RabbitMQ
      |
      ▼
Workers
      |
      ▼
Redis Feed Cache
```

Reading becomes very fast.

```text id="kq8mzi"
GET /feed

↓

Redis

↓

Return Feed
```

### Complexity

Read

```text id="4trmxm"
O(1)
```

Write

```text id="4b7o3t"
O(Number of Followers)
```

For users with millions of followers, write amplification becomes a significant concern.

---

# Hybrid Feed Performance

The hybrid model combines the advantages of both strategies.

### Regular Users

* Feed updates are pushed into Redis.

### Celebrity Users

* Posts remain in MongoDB.
* Retrieved only when followers request their feeds.

Flow:

```text id="t7gkcp"
Redis Feed

+

Celebrity Posts

↓

Merge

↓

Ranking

↓

Return Feed
```

This approach provides low latency while reducing infrastructure costs.

---

# Latency Comparison

The following values represent expected performance under normal conditions.

| Following Count |    Pull | Push | Hybrid |
| --------------: | ------: | ---: | -----: |
|              10 |    5 ms | 1 ms |   2 ms |
|             100 |   18 ms | 1 ms |   3 ms |
|           1,000 |   90 ms | 2 ms |   5 ms |
|          10,000 | 300+ ms | 3 ms |   8 ms |

These numbers are illustrative and will vary depending on hardware, indexes, network latency, and dataset size.

---

# Scalability Analysis

The architecture scales horizontally by adding more infrastructure instead of replacing existing servers.

## API Layer

```text id="m89aqd"
API Server 1

API Server 2

API Server 3

API Server N
```

Requests are distributed using a load balancer.

---

## Feed Workers

```text id="9z9l6t"
Worker 1

Worker 2

Worker 3

Worker 4

Worker N
```

More workers increase queue processing capacity.

---

## MongoDB

```text id="4ryj1n"
Shard A

Shard B

Shard C

Shard D
```

New shards can be added as data grows.

---

## Redis

```text id="evd1yi"
Redis Cluster

↓

Node 1

Node 2

Node 3
```

Redis Cluster distributes keys across multiple nodes.

---

# Storage Analysis

### Pull Model

Only one copy of each post exists.

Advantages:

* Minimal storage
* Easy maintenance

Disadvantages:

* Expensive reads

---

### Push Model

Each follower stores a copy of the post in their feed.

Example:

```text id="94z0y6"
Followers

1,000,000

↓

1 Post

↓

1,000,000 Feed Entries
```

Advantages:

* Very fast reads

Disadvantages:

* High storage consumption

---

### Hybrid Model

Regular users:

* Push

Celebrity users:

* Pull

Storage remains balanced.

---

# Why Hybrid is Recommended

The hybrid strategy is widely used because it combines the strengths of both approaches.

Benefits include:

* Fast feed retrieval
* Reduced database load
* Lower write amplification
* Better handling of celebrity accounts
* Horizontal scalability
* Improved resource utilization

---

# Future Improvements

A production-scale feed system can be enhanced with additional capabilities.

### Machine Learning Ranking

Instead of a simple score:

```text id="cjlwm5"
Recency

+

Likes
```

Use:

* User interests
* Watch time
* Click-through rate
* Comments
* Shares
* Device type
* Time of day
* Previous interactions

Machine learning models can generate personalized rankings.

---

### Trending Service

Separate service for:

* Trending hashtags
* Viral posts
* Popular creators

---

### Notification Service

Generate notifications when:

* New posts are created
* Likes are received
* Users gain followers

---

### Search Integration

Integrate Elasticsearch or OpenSearch for:

* Full-text search
* Hashtag search
* User search

---

### Media Processing

Use asynchronous workers for:

* Image compression
* Video transcoding
* Thumbnail generation

---

### CDN Integration

Store media files in object storage and serve them through a Content Delivery Network (CDN) to reduce latency worldwide.

---

# Conclusion

This High-Level Design presents a scalable architecture for building a Twitter or Instagram-style feed system capable of supporting millions of users.

The system combines multiple distributed system techniques:

* Redis for low-latency feed retrieval
* RabbitMQ for asynchronous feed generation
* MongoDB sharding for horizontal scalability
* Replica sets for high availability
* Hybrid feed generation for efficient handling of both regular and celebrity users
* Configurable ranking to improve content relevance

Compared with pure pull or pure push architectures, the hybrid approach provides the best balance between read performance, write efficiency, storage utilization, and operational cost.

By combining caching, queueing, sharding, replication, and ranking, the system can continue to deliver fast, reliable, and highly available personalized feeds even under very large workloads. This architecture forms a strong foundation for modern social media platforms and can be extended with machine learning, distributed search, real-time notifications, and global content delivery as the application grows.


# 10. Deployment, Monitoring, End-to-End Execution and Interview Notes

This section explains how the complete system is deployed, monitored, executed, and presented during an interview or demonstration.

---

# Deployment Architecture

The system is deployed using Docker Compose so that every service can run independently while communicating over an internal Docker network.

```text
                    Docker Network
                           |
    --------------------------------------------------------
    |            |            |            |               |
 Express API   MongoDB      Redis      RabbitMQ      Feed Workers
    |            |            |            |               |
    --------------------------------------------------------
                           |
                       Client Browser
```

Each service is isolated inside its own container, making deployment easier and improving fault isolation.

---

# Docker Services

| Service     | Purpose                                    |
| ----------- | ------------------------------------------ |
| Express API | Handles HTTP requests                      |
| MongoDB     | Stores users, posts, follows and likes     |
| Redis       | Stores cached feeds                        |
| RabbitMQ    | Message broker for asynchronous processing |
| Feed Worker | Consumes queue messages and updates Redis  |

---

# End-to-End Request Flow

## Step 1: User Login

```text
Client
   |
POST /login
   |
JWT Generated
   |
Token Returned
```

The client stores the JWT token and sends it with every protected request.

---

## Step 2: User Creates a Post

```text
Client

↓

POST /post

↓

JWT Verification

↓

Rate Limiter

↓

MongoDB

↓

RabbitMQ

↓

201 Created
```

After the response is returned, background workers update follower feeds asynchronously.

---

## Step 3: Feed Worker

```text
RabbitMQ

↓

Receive Message

↓

Find Followers

↓

Update Redis

↓

Acknowledge Queue Message
```

---

## Step 4: User Opens Feed

```text
Client

↓

GET /feed

↓

Redis

↓

Cache Hit?

↓

YES

↓

Return Feed
```

If Redis does not contain the feed:

```text
Redis Miss

↓

MongoDB

↓

Generate Feed

↓

Store Redis

↓

Return Feed
```

---

# Ranking Pipeline

Once posts have been collected, they are ranked before being returned.

```text
Posts

↓

Calculate Score

↓

Sort

↓

Top 20

↓

Client
```

Example scoring formula:

```text
Score =
(Recency Weight × Recency Score)
+
(Like Weight × Like Count)
```

The ranking weights can be modified through configuration without changing application code.

---

# Monitoring

To ensure the system remains healthy, important metrics should be collected continuously.

## API Metrics

* Total requests
* Successful requests
* Failed requests
* Average response time
* P95 latency
* P99 latency

---

## Redis Metrics

* Cache hit rate
* Cache miss rate
* Memory usage
* Connected clients
* Evictions

---

## RabbitMQ Metrics

* Queue depth
* Processing rate
* Consumer count
* Retry count
* Dead Letter Queue size

---

## MongoDB Metrics

* Query latency
* Write latency
* Connections
* Replication lag
* Disk utilization

---

# Logging

Every request should produce structured logs.

Example:

```json
{
  "timestamp": "2026-07-10T10:15:30Z",
  "service": "feed-api",
  "userId": "1001",
  "endpoint": "/feed",
  "latencyMs": 7,
  "status": 200
}
```

Structured logs simplify debugging and production monitoring.

---

# Security Considerations

The system incorporates multiple security mechanisms.

* JWT Authentication
* Password hashing using bcrypt
* HTTPS communication
* Input validation
* Rate limiting
* Secure environment variables
* Authorization middleware
* Request logging
* Audit trail

---

# Assumptions

This design assumes:

* Users can follow many accounts.
* Posts are immutable after creation.
* Redis stores only recent feed entries.
* MongoDB is the source of truth.
* Feed workers are stateless.
* RabbitMQ guarantees durable message delivery.

---

# Project Deliverables

The completed project contains:

* Pull Feed Implementation
* Push Feed Implementation
* Hybrid Feed Implementation
* Feed Ranking Engine
* MongoDB Models
* Redis Cache Integration
* RabbitMQ Queue Integration
* Feed Worker
* Configuration Files
* Unit Tests
* Docker Compose
* API Documentation
* Postman Collection
* High-Level Design Document
* README

---

# How to Run the Project

## Step 1

Clone the repository.

```bash
git clone <repository-url>
```

---

## Step 2

Install dependencies.

```bash
npm install
```

---

## Step 3

Start infrastructure.

```bash
docker-compose up -d
```

This starts:

* MongoDB
* Redis
* RabbitMQ

---

## Step 4

Configure environment variables.

```text
PORT=5000
MONGO_URI=mongodb://localhost:27017/feeddb
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost
JWT_SECRET=your-secret
```

---

## Step 5

Start the API server.

```bash
npm start
```

---

## Step 6

Start feed workers.

```bash
node src/workers/feed.worker.js
```

---

# Interview Summary

If asked to summarize the design:

> The feed system combines three feed generation strategies. Pull is used for generating feeds dynamically, Push precomputes feeds for regular users using RabbitMQ and Redis, and Hybrid combines both to efficiently support celebrity accounts. Redis minimizes read latency, RabbitMQ handles asynchronous fan-out, MongoDB shards provide horizontal scalability, and replica sets ensure high availability. A configurable ranking engine returns the most relevant posts instead of only the newest ones, making the architecture scalable, resilient, and suitable for large social media platforms.

---

# Final Conclusion

The proposed architecture satisfies the functional and non-functional requirements of a modern feed generation system. It minimizes latency through Redis caching, improves scalability using MongoDB sharding, ensures reliability with RabbitMQ and replica sets, and balances read and write performance through a hybrid fan-out strategy. The modular design also allows future enhancements such as machine learning ranking, real-time recommendations, and global content delivery without major architectural changes.


# Appendix - Design Decisions and Justifications

This appendix explains why specific technologies and architectural patterns were selected for the feed system.

---

# Why Node.js?

Node.js is well suited for I/O-intensive applications because it uses an event-driven, non-blocking architecture.

Advantages:

* Handles thousands of concurrent connections
* Fast API response times
* Large ecosystem (Express, JWT, Redis, RabbitMQ)
* Easy integration with JavaScript frontend frameworks

---

# Why Express?

Express provides a lightweight web framework for implementing REST APIs.

Benefits:

* Minimal boilerplate
* Easy routing
* Middleware support
* Large community support

---

# Why MongoDB?

The feed system stores rapidly growing user and post data.

MongoDB was selected because it provides:

* Flexible document schema
* Horizontal sharding
* High write throughput
* Replica set support
* Easy scaling

Example Collections:

```text id="7sbf34"
Users

Posts

Follows

Likes
```

---

# Why Redis?

Feed retrieval is the most frequent operation in the system.

Reading every request from MongoDB would increase latency significantly.

Redis provides:

* In-memory storage
* Very low latency
* High throughput
* Simple data structures
* Easy cache invalidation

Typical operations:

```text id="gjy7ad"
LPUSH

LRANGE

LTRIM

EXPIRE
```

---

# Why RabbitMQ?

RabbitMQ enables asynchronous processing.

Instead of making users wait while millions of feed entries are generated, the work is delegated to background workers.

Advantages:

* Reliable delivery
* Durable queues
* Retry support
* Dead Letter Queue
* Loose coupling

---

# Why Hybrid Feed?

Pure Push

Advantages:

* Fast reads

Disadvantages:

* Huge write amplification

---

Pure Pull

Advantages:

* Low storage

Disadvantages:

* Slow reads

---

Hybrid combines both.

Decision Rule:

```text id="l3d62j"
Followers < Threshold

↓

Push

----------------

Followers ≥ Threshold

↓

Pull
```

This reduces infrastructure cost while maintaining excellent user experience.

---

# Capacity Planning Example

Assume:

* 100 Million registered users
* 10 Million Daily Active Users
* Average followers: 300
* Average posts per user per day: 2

Daily posts:

```text id="fmkf5z"
10 Million

×

2

=

20 Million Posts
```

Average feed requests:

```text id="6ncrfp"
10 Million Users

×

25 Feed Refreshes

=

250 Million Feed Requests
```

These numbers illustrate why caching and asynchronous processing are essential.

---

# Scaling Strategy

## API Layer

Scale horizontally.

```text id="k6guh6"
Load Balancer

↓

API 1

API 2

API 3

API N
```

---

## Worker Layer

Increase workers based on queue length.

```text id="smx6gf"
RabbitMQ

↓

Worker Pool

↓

More Workers

↓

Higher Throughput
```

---

## Database Layer

Add new shards as storage requirements increase.

```text id="c0whif"
Shard 1

Shard 2

Shard 3

Shard 4

Shard N
```

---

## Cache Layer

Deploy Redis Cluster.

```text id="kxjxtf"
Redis Node 1

Redis Node 2

Redis Node 3
```

Keys are automatically distributed across the cluster.

---

# Possible Enhancements

The architecture can be extended with:

* Machine Learning based feed ranking
* Real-time recommendation engine
* Story feeds
* Short video feeds
* Notification microservice
* GraphQL gateway
* Elasticsearch/OpenSearch
* Kafka for very high throughput event streaming
* CDN for media delivery
* Kubernetes deployment with auto-scaling

---

# Final Architecture Summary

```text id="ezcmg0"
                      Client
                         |
                    API Gateway
                         |
              Authentication & Rate Limiter
                         |
                  Load Balancer
                         |
                  Application Servers
                  /       |        \
                 /        |         \
            Redis     RabbitMQ    MongoDB
               |          |       /   |   \
               |      Feed Workers Shards Replicas
                \         |          /
                 \--------+---------/
                          |
                    Ranking Engine
                          |
                    Personalized Feed
```

---

# Final Key Takeaways

* **MongoDB** stores durable application data.
* **Redis** serves low-latency feed responses.
* **RabbitMQ** performs asynchronous fan-out.
* **Workers** populate follower feeds in the background.
* **Hybrid fan-out** balances read and write performance.
* **Sharding** enables horizontal database scaling.
* **Replication** improves availability and disaster recovery.
* **Ranking** increases user engagement by prioritizing relevant posts.
* **Load balancing** and stateless application servers allow the system to scale to millions of users.

This architecture demonstrates how modern social media platforms can efficiently generate personalized feeds while maintaining low latency, high availability, and horizontal scalability.


# Appendix - System Design Decisions, Assumptions, Limitations and References

This appendix summarizes the key architectural decisions made throughout the project, documents the assumptions under which the system was designed, highlights known limitations, and provides references for future improvements.

---

# Design Decisions

The following table summarizes the major design decisions taken during the development of this feed system.

| Design Decision             | Reason                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| MongoDB as primary database | Flexible schema, horizontal sharding, high write throughput                         |
| Redis as cache              | Extremely low read latency for feed retrieval                                       |
| RabbitMQ for messaging      | Reliable asynchronous processing and decoupling                                     |
| JWT authentication          | Stateless authentication suitable for distributed systems                           |
| Express API                 | Lightweight REST framework with middleware support                                  |
| Hybrid feed strategy        | Balances write amplification and read latency                                       |
| Ranking service             | Improves feed relevance and user engagement                                         |
| Background workers          | Keeps API response times low by moving expensive operations out of the request path |

---

# Assumptions

This design is based on the following assumptions:

* Users may follow thousands of other users.
* Users can create text-based posts.
* Feed generation returns the latest or highest-ranked 20 posts.
* Redis stores only recent feed entries.
* MongoDB is the source of truth for all application data.
* RabbitMQ guarantees durable message delivery.
* Feed workers are stateless and can be scaled horizontally.
* Authentication has already been completed before business logic executes.
* The application is deployed in a trusted cloud environment.

---

# Constraints

To keep the project manageable, several features are intentionally simplified.

These include:

* Basic ranking formula instead of machine learning.
* Text posts only.
* Single-region deployment.
* Basic follower model.
* No image or video processing.
* No recommendation engine.
* No advertisement ranking.
* No notification service.

These simplifications allow the project to focus on feed generation architecture rather than product-specific features.

---

# System Bottlenecks

Potential bottlenecks include:

## Database

Very large read traffic may overload MongoDB if cache efficiency decreases.

Mitigation:

* Redis cache
* Read replicas
* Proper indexing

---

## Queue

A sudden increase in post creation can increase queue length.

Mitigation:

* Additional workers
* Queue partitioning
* Monitoring queue depth
* Dead Letter Queue

---

## Redis

Insufficient memory may lead to eviction of cached feeds.

Mitigation:

* Redis Cluster
* Appropriate eviction policies
* Feed TTL configuration

---

## Network

Latency between services may increase response time.

Mitigation:

* Deploy services within the same data center or availability zone.
* Use persistent connections.
* Apply request timeouts and retry policies.

---

# Monitoring Checklist

The following metrics should be monitored continuously.

### API

* Request count
* Error rate
* Average latency
* P95 latency
* P99 latency

### Redis

* Memory usage
* Cache hit ratio
* Cache miss ratio
* Connected clients

### RabbitMQ

* Queue length
* Consumer count
* Message processing rate
* Retry count
* Dead Letter Queue size

### MongoDB

* Read latency
* Write latency
* Active connections
* Replication lag
* Disk utilization

---

# Production Readiness Checklist

| Feature             | Status |
| ------------------- | ------ |
| JWT Authentication  | ✓      |
| Rate Limiting       | ✓      |
| MongoDB Persistence | ✓      |
| Redis Feed Cache    | ✓      |
| RabbitMQ Queue      | ✓      |
| Feed Workers        | ✓      |
| Pull Feed           | ✓      |
| Push Feed           | ✓      |
| Hybrid Feed         | ✓      |
| Ranking Engine      | ✓      |
| Docker Compose      | ✓      |
| Logging             | ✓      |
| Unit Tests          | ✓      |
| API Documentation   | ✓      |

---

# Possible Future Enhancements

The architecture can be extended to support enterprise-scale deployments by introducing:

* Kubernetes for orchestration
* Auto Scaling Groups
* API Gateway with service discovery
* Kafka for high-throughput event streaming
* Redis Cluster with Sentinel
* Elasticsearch/OpenSearch for search
* Object storage for media files
* CDN for global media delivery
* Machine Learning ranking models
* Personalized recommendations
* GraphQL gateway
* Multi-region deployment with geo-replication

---

# References

The design concepts used in this project are inspired by distributed systems principles and publicly available engineering resources from large-scale platforms.

Topics referenced include:

* Feed generation strategies
* Caching patterns
* Message queues
* Database sharding
* Replication
* Distributed system scalability
* High availability
* Fault tolerance

---

# Final Conclusion

This capstone project demonstrates the design of a scalable Twitter/Instagram-style feed generation system capable of supporting millions of users. By integrating Redis for caching, RabbitMQ for asynchronous messaging, MongoDB sharding for scalable storage, replica sets for availability, and a hybrid fan-out strategy, the architecture achieves low latency, high throughput, and resilience under heavy load.

The design intentionally separates responsibilities across independent components, allowing each layer to scale horizontally and fail independently. This modular approach simplifies maintenance, improves fault isolation, and provides a strong foundation for future enhancements such as machine learning-based ranking, real-time recommendations, and global multi-region deployments.

Overall, the proposed architecture satisfies both the functional and non-functional requirements of a modern social media feed system while balancing performance, scalability, reliability, and operational cost.
