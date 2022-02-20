const AWS = require("aws-sdk");
const DynomoDB = require("aws-sdk/clients/dynamodb");
const StepFunction = new AWS.StepFunctions();
const DocumentClient = new DynomoDB.DocumentClient({ region: "us-east-2" });
const isBookAvailable = (book, quantity) => {
  return book.quantity - quantity > 0;
};

const deductPoint = async (userId) => {
  let params = {
    TableName: "UserTable",
    Key: { userId: userId },
    UpdateExpression: "SET points = :zero",
    ExpressionAttributeValues: {
      ":zero": 0,
    },
  };
  await DocumentClient.update(params).promise();
};
module.exports.checkInventory = async ({ bookId, quantity }) => {
  try {
    let params = {
      TableName: "BookTable",
      KeyConditionExpression: "bookId = :bookid",
      ExpressionAttributeValues: {
        ":bookid": bookId,
      },
    };

    let result = await DocumentClient.query(params).promise();
    let book = result.Items[0];
    if (isBookAvailable(book, quantity)) {
      return book;
    } else {
      let bookOutOfStockError = new Error("The book is out of stock");
      bookOutOfStockError.name = "BookOutOfStock";
      throw bookOutOfStockError;
    }
  } catch (e) {
    if (e.name === "BookOutOfStock") {
      throw e;
    } else {
      let letBookNotFoundError = new Error(e);
      letBookNotFoundError.name = "BookNotFound";
      throw letBookNotFoundError;
    }
  }
};
module.exports.calculateTotal = async ({ book, quantity }) => {
  let total = book.price * quantity;
  return {
    total,
  };
};

module.exports.redeemPoints = async ({ userId, total }) => {
  let orderTotal = total.total;
  try {
    let params = {
      TableName: "UserTable",
      Key: {
        userId: userId,
      },
    };
    let result = await DocumentClient.get(params).promise();
    let user = result.Item;
    const points = user.points;
    if (orderTotal > points) {
      await deductPoint(userId);
      orderTotal = orderTotal - points;
      return { total: orderTotal, points };
    } else {
      throw new Error("Order Total is less then redeemed points");
    }
  } catch (e) {
    throw new Error(e);
  }
};
module.exports.billCustomer = async ({ book, quantity }) => {
  return "Sucessfully Billed";
};
module.exports.restoreRedeemedPoints = async ({ userId, total }) => {
  try {
    if (total.points) {
      let params = {
        TableName: "UserTable",
        Key: { userId: userId },
        UpdateExpression: "set points = :points",
        ExpressionAttributeValues: {
          ":points": total.points,
        },
      };
      await DocumentClient.update(params).promise();
    }
  } catch (e) {
    throw new Error(e);
  }
};

const updateBookQuantity = async (bookId, orderQuantity) => {
  console.log("bookId: ", bookId);
  console.log("orderQuantity: ", orderQuantity);
  let params = {
    TableName: "BookTable",
    Key: { bookId: bookId },
    UpdateExpression: "SET quantity = quantity - :orderQuantity",
    ExpressionAttributeValues: {
      ":orderQuantity": orderQuantity,
    },
  };
  await DocumentClient.update(params).promise();
};

module.exports.sqsWorker = async (event) => {
  try {
    console.log(JSON.stringify(event));
    let record = event.Records[0];
    var body = JSON.parse(record.body);
    /** Find a courier and attach courier information to the order */
    let courier = "arslanismail840@gmail.com";

    // update book quantity
    await updateBookQuantity(body.Input.bookId, body.Input.quantity);

    // throw "Something wrong with Courier API";

    // Attach curier information to the order
    await StepFunction.sendTaskSuccess({
      output: JSON.stringify({ courier }),
      taskToken: body.Token,
    }).promise();
  } catch (e) {
    console.log("===== You got an Error =====");
    console.log(e);
    await StepFunction.sendTaskFailure({
      error: "NoCourierAvailable",
      cause: "No couriers are available",
      taskToken: body.Token,
    }).promise();
  }
};

module.exports.restoreQuantity = async ({ bookId, quantity }) => {
  let params = {
    TableName: "BookTable",
    Key: { bookId: bookId },
    UpdateExpression: "set quantity = quantity + :orderQuantity",
    ExpressionAttributeValues: {
      ":orderQuantity": quantity,
    },
  };
  await DocumentClient.update(params).promise();
  return "Quantity restored";
};
