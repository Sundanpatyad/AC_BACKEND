const express = require('express')
const app = express();
const path = require("path");

// packages
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

// connection to DB and cloudinary
const { connectDB } = require('./config/database');
const { cloudinaryConnect } = require('./config/cloudinary');

// routes
const userRoutes = require('./routes/user');
const profileRoutes = require('./routes/profile');
const paymentRoutes = require('./routes/payments');
const courseRoutes = require('./routes/course');
const mockRoutes = require("./routes/mocktest")
const chatRoutes = require("./routes/chatRoutes")
const materialRoutes = require('./routes/studyMaterialsRoutes')

// middleware 
app.use(express.json()); // to parse json body
app.use(cookieParser());
app.use(cors());
app.use(
    fileUpload({
        useTempFiles: true,
        tempFileDir: '/tmp'
    })
)

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server Started on PORT ${PORT}`);
});

// connections
connectDB();
cloudinaryConnect();

// mount route
app.use('/api/v1/auth', userRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/course', courseRoutes);
app.use('/api/v1/mock', mockRoutes);
app.use('/api/v1/chats', chatRoutes);
app.use('/api/v1/materials', materialRoutes);

if (process.env.NODE_ENV === "production") {
    // Serve static files from the frontend/dist directory
    app.use(express.static(path.join(__dirname, "../frontend/dist")));

    // For all other requests, serve the React app's index.html
    app.get("*", (req, res) => {
        res.sendFile(path.resolve(__dirname, "../frontend/dist", "index.html"));
    });
}

// Default Route
app.get('/', (req, res) => {
    res.send(`
    <div>
        This is Default Route  
        <p>Everything is OK</p>
    </div>`);
});
