const mongoose = require('mongoose');
require("dotenv").config()
let dbURI=""
if (process.env.NODE_ENV == "development") {
    dbURI = process.env.DB_DEV
}
else if (process.env.NODE_ENV=="production") {
    dbURI = process.env.DB_PROD
}
else {
    // console.log('error invalid env, could not start db');
    throw new Error("error invalid env, could not start db")
    
}
const startDb = () => {
    mongoose.connect(dbURI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'MongoDB connection error:'));
    db.once('open', function () {
        console.log('Connected to MongoDB');
    });
}

let isConnected = false;

async function startDBConnection() {
    try {
        if (!isConnected) {
            await mongoose.connect(dbURI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
               
            });
            isConnected = true;
            console.log('Connected to MongoDB');
        } else {
            console.log('Already connected to MongoDB');
        }
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error; // Propagate the error to the caller
    }
}

async function closeDBConnection() {
    try {
        if (isConnected) {
            await mongoose.disconnect();
            isConnected = false;
            console.log('MongoDB connection closed');
        }
    } catch (error) {
        console.error('Error closing MongoDB connection:', error);
        throw error; 
    }
}
module.exports = {
    startDb,
    startDBConnection,
    closeDBConnection
}

