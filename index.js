const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require("cookie-parser");
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 9000;
const app = express();


// middleware 

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.tp3bo.mongodb.net/?appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// verify token 
const verifyToken = async (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res
      .status(401)
      .send({ message: 'UnAuthorize Access' })
  }
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ message: 'UnAuthorize Access' })
    }
    req.user = decoded;
  })

  next();
}

async function run() {
  try {

    const db = client.db('solo-db')
    const jobsCollection = db.collection('jobs');
    const bidsCollection = db.collection('bids');


    // generate jwt
    app.post('/jwt', async (req, res) => {
      const email = req.body;
      // create token
      const token = jwt.sign(email, process.env.SECRET_KEY, { expiresIn: '1h' });
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: false,
          sameSite: 'strict'
        })
        .send({ success: true });
    })

    // clear cookie 
    app.post('/logout', async (req, res) => {
      res.clearCookie('token', {
        maxAge: 0,
        secure: false
      });
      res.send({ success: true })
    })

    // save  a job to db
    app.post('/add-job', verifyToken, async (req, res) => {
      const jobData = req.body;
      const result = await jobsCollection.insertOne(jobData);

      console.log(result);
      res.send(result);
    })

    // get all jobs data from db
    app.get('/jobs', async (req, res) => {
      const result = await jobsCollection.find().toArray();
      res.send(result);
    })

    // get all jobs posted by a specific user
    app.get(`/jobs/:email`, verifyToken, async (req, res) => {
      const decodedEmail = req.user.email;
      const email = req.params.email;

      if (decodedEmail !== email) {
        return res.status(401).send({ message: 'UnAuthorize Access' })
      }

      const query = { 'buyer.email': email }
      const result = await jobsCollection.find(query).toArray();
      res.send(result);


    })

    // delete a job from db
    app.delete('/jobs/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.deleteOne(query);
      res.send(result);
    })

    // get a single job data by id from db
    app.get('/job/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    })

    // update a job data by id 
    app.put('/update-job/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const jobData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateData = {
        $set: jobData
      }
      const options = { upsert: true }
      const result = await jobsCollection.updateOne(query, updateData, options)
      res.send(result)
    })

    // save a bid to db 
    app.post('/add-bid', verifyToken, async (req, res) => {
      const bidData = req.body;

      // 1. if place a bit already in this job
      const query = { email: bidData.email, jobId: bidData.jobId }
      const alreadyExist = await bidsCollection.findOne(query);
      if (alreadyExist) {
        return res.status(400).send({ message: 'You have already apply bid on this job!' })
      }

      // save data in bidsCollection
      const result = await bidsCollection.insertOne(bidData);

      // increase bid count in JobsCollection
      const filter = { _id: new ObjectId(bidData.jobId) };
      const update = {
        $inc: {
          bid_count: 1
        }
      }
      const updateBidCount = await jobsCollection.updateOne(filter, update)

      res.send(result);
    })
    // get all bids for a specific user 
    app.get('/bids/:email', verifyToken, async (req, res) => {
      const isBuyer = req.query.buyer;
      const email = req.params.email;
      let query = {}
      if (isBuyer) {
        query.buyer = email;
      }
      else {
        query.email = email;
      }
      const result = await bidsCollection.find(query).toArray();
      res.send(result)
    })


    // update bid status
    app.patch('/bid-status-update/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updated = {
        $set: {
          status
        }
      }
      const result = await bidsCollection.updateOne(filter, updated)
      res.send(result);

    })

    // get All Jobs 
    app.get('/all-jobs', async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      const sort = req.query.sort;

      let options = {};
      if (sort) {
        options = { sort: { deadLine: sort === 'asc' ? 1 : -1 } }
      }

      let query = {
        title: {
          $regex: search, $options: 'i'
        }
      };
      if (filter) {
        query.category = filter;
      }
      const result = await jobsCollection.find(query, options).toArray();
      res.send(result)
    })

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello from SoloSphere Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))