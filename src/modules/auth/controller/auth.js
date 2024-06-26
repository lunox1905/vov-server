
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const SECRET_KEY = process.env.SECRET_KEY
const User = require('../model/auth');
const register = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({
                "status": 'error',
                message: "Fields are empty"
            })
        }
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({
                status: "error",
                message: 'User already exists'
            });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            email: email,
            password: hashedPassword,
        });
        await newUser.save();
        return res.status(201).json({
            status: "success",
        });
    } catch (error) {
        console.log(error);
        
        return res.status(500).json({
            status: "error",
            message: 'Server error'
        });
    }
   
};
const login = async (req, res) => {
    try {        
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                "status": 'error',
                message: "Fields are empty"
            })
        }
        // Find the user
        const user = await User.findOne({ email });
        if (!user) {
            
            return res.status(400).json({
                status: "error",
                message: 'Invalid credentials'
            });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            
            return res.status(400).json({
                status: "error",
                message: 'Invalid credentials'
            });
        }

        const token = jwt.sign({ email }, SECRET_KEY);
       return res.status(200).json({
            "status": "success",
            token
        });
    } catch (error) {
        console.log('Error',error);
        res.status(500).json({
            status: 'error',
            message: 'Server error'
        })
    }
   
};
const protectedRoute = (req, res) => {
    res.status(200).json({
        status:"success",
        message: 'This is a protected route', user: req.user
    });
};

module.exports = {
    register,
    login,
    protectedRoute
};
