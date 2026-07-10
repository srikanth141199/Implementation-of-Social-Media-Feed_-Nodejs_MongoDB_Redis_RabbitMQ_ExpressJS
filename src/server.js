require('dotenv').config();
const express=require('express');
const app=express();
app.use(express.json());
app.get('/',(_,res)=>res.json({message:'Assignment 11 Feed System API'}));
app.listen(process.env.PORT||5000,()=>console.log('Server running'));
