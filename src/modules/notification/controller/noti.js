const Noti = require("../model/noti")
const createNoti = async (data) => {
    try {
        const { level, title, content } = data;

        // Validate data
        if (!level || !title || !content) {
            return {
                error: true,
                msg: `Param data has null value: level ${level}, title ${title}, content ${content}`
            };
        }

        // Create a new notification instance
        const newNoti = new Noti({
            level: level,
            title: title,
            content: content
        });

        // Save the new notification to the database
        const savedNoti = await newNoti.save();

        // Return the saved notification
        return {
            error: false,
            data: savedNoti
        };
    } catch (error) {
        console.log(error);
        return {
            error: true,
            msg: error.message
        };
    }
};
module.exports = {
    createNoti
}