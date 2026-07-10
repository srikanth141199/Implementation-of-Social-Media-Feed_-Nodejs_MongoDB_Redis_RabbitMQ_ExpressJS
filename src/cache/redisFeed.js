const Redis=require('ioredis');
const redis=new Redis(process.env.REDIS_URL);

exports.addToFeed=async(userId,post)=>{
 await redis.lpush(`feed:${userId}`,JSON.stringify(post));
 await redis.ltrim(`feed:${userId}`,0,999);
};

exports.getFeed=async(userId)=>{
 const data=await redis.lrange(`feed:${userId}`,0,49);
 return data.map(JSON.parse);
};
