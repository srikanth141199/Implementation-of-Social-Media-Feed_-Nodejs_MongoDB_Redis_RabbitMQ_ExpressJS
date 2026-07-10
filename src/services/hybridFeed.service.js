const cfg=require('../config/feed.config');
const cache=require('../cache/redisFeed');
const User=require('../models/User');
const Post=require('../models/Post');

exports.getHybridFeed=async(userId)=>{
 const cached=await cache.getFeed(userId);
 const celebs=await User.find({followers:{$gt:cfg.CELEBRITY_THRESHOLD}}).select('_id');
 const celebIds=celebs.map(c=>c._id);
 const celebPosts=await Post.find({author:{$in:celebIds}})
   .sort({createdAt:-1})
   .limit(cfg.FEED_LIMIT)
   .lean();

 const merged=[...cached,...celebPosts]
   .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))
   .slice(0,cfg.FEED_LIMIT);

 return merged;
};
