const amqp=require('amqplib');
exports.publishPost=async(post)=>{
 const conn=await amqp.connect(process.env.RABBITMQ_URL);
 const ch=await conn.createChannel();
 await ch.assertQueue('feed-posts');
 ch.sendToQueue('feed-posts',Buffer.from(JSON.stringify(post)));
 setTimeout(()=>conn.close(),500);
};
