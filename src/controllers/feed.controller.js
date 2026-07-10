const cache=require('../cache/redisFeed');
exports.cachedFeed=async(req,res)=>{
 const feed=await cache.getFeed(req.user.id);
 res.json({source:'redis',count:feed.length,feed});
};
const r=require('express').Router();
const c=require('../controllers/feed.controller');
r.get('/feed',c.cachedFeed);
module.exports=r;

const svc=require('../services/pullFeed.service');
exports.pullFeed=async(req,res)=>{
 const start=Date.now();
 const feed=await svc.getFeed(req.user.id);
 res.json({
   latencyMs:Date.now()-start,
   count:feed.length,
   feed
 });
};
