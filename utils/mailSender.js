const nodemailer = require('nodemailer');

const mailSender = async (email, title, body) => {
    try {
        let transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS
            }
        });

        // Verify transporter connection
        await transporter.verify();

        // Send mail
        const info = await transporter.sendMail({
            from: `"Awakening Classes" <${process.env.MAIL_USER}>`,
            to: email,
            subject: title,
            html: body
        });
        //console.log(email, title, body);

        //console.log('Email sent successfully:', info.messageId);
        return info;
    }
    catch (error) {
        console.error('Error in mailSender:', error);
        throw error;
    }
};

module.exports = mailSender;