const cluster = require('cluster');
const os = require('os');
const express = require('express');
const path = require("path");
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const { connectDB } = require('./config/database');
const { cloudinaryConnect } = require('./config/cloudinary');

const userRoutes = require('./routes/user');
const profileRoutes = require('./routes/profile');
const paymentRoutes = require('./routes/payments');
const courseRoutes = require('./routes/course');
const mockRoutes = require("./routes/mocktest");
const chatRoutes = require("./routes/chatRoutes");
const admin = require("./routes/adminRoutes");
const materialRoutes = require('./routes/studyMaterialsRoutes');

const numCPUs = os.cpus().length;
console.log(numCPUs)
if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        // Replace the dead worker
        cluster.fork();
    });
} else {
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(cookieParser());
    app.use(cors());
    app.use(fileUpload({
        useTempFiles: true,
        tempFileDir: '/tmp'
    }));

    // Connections
    connectDB();
    cloudinaryConnect();

    // Mount routes
    app.use('/api/v1/auth', userRoutes);
    app.use('/api/v1/profile', profileRoutes);
    app.use('/api/v1/payment', paymentRoutes);
    app.use('/api/v1/course', courseRoutes);
    app.use('/api/v1/mock', mockRoutes);
    app.use('/api/v1/chats', chatRoutes);
    app.use('/api/v1/materials', materialRoutes);
    app.use('/api/v1/admin', admin);

    // Default Route
    app.get('/', (req, res) => {
        res.send(`
        <div>
            This is Default Route
            <p>Everything is OK</p>
            <p>Worker ${process.pid} responded to this request</p>
            <p>Total number of Cpu's ${numCPUs} responded to this request</p>
        </div>`);
    });

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
        console.log(`Worker ${process.pid} started on PORT ${PORT}`);
    });
}