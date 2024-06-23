const assert = require('assert');
const { startDBConnection} = require("../src/db")
const {createNoti} =require("../src/modules/notification/controller/noti")
describe('Test update notification in database in dev mode', function () {
    before(function () {
        require("dotenv").config()
        if (process.env.NODE_ENV == "production") {
            throw new Error('Setup failed: env must be developement');
        }
       startDBConnection()
    });

    after(function () {
        // runs once after the last test in this block
    });

    beforeEach(function () {
        // runs before each test in this block
    });

    afterEach(function () {
        // runs after each test in this block
    });

    describe('Create new log', function () {
        it('should return success log created',async function () {
            const log_data = {
                "level": "info",
                "title": 'testlog',
                "content": 'empty'
            }
            const output = await createNoti(log_data)
            console.log(output)
            assert.notEqual(output, null);
        });
    });
    describe('Array', function () {
        it('should return -1 when the value is not present', function () {
            assert.strictEqual([1, 2, 3].indexOf(4), -1);
        });
    });


});