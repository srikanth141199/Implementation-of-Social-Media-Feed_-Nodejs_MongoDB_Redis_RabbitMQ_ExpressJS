const amqp=require('amqplib');
const User=require('../models/User');
const cache=require('../cache/redisFeed');

(async()=>{
 const conn=await amqp.connect(process.env.RABBITMQ_URL);
 const ch=await conn.createChannel();
 await ch.assertQueue('feed-posts');
 ch.consume('feed-posts',async msg=>{
   const post=JSON.parse(msg.content.toString());
   const followers=await User.find({_id:{$in:post.followers||[]}});
   for(const f of followers){
      await cache.addToFeed(f._id,post);
   }
   ch.ack(msg);
 });
})();
