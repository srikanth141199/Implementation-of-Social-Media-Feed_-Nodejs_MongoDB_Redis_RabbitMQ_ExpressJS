const svc=require('../services/hybridFeed.service');
exports.feed=async(req,res)=>{
 const feed=await svc.getHybridFeed(req.user.id);
 res.json({
   strategy:'hybrid',
   threshold:10000,
   count:feed.length,
   feed
 });
};
