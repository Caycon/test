'use strict';

const { default: mongoose } = require('mongoose');
const moongose = require('mongoose');
const axios = require('axios');

const stockSchema = new mongoose.Schema({
  code: String,
  likes: { type: [String], default: [] }
});
const Stock = mongoose.model('stock', stockSchema);

// Định nghĩa hàm saveStock luu ma co phieu vao database
function saveStock(code, like, ip) {
  return Stock.findOne({ code: code }).then((foundStock) => {
    if (!foundStock) {
      let newStock = new Stock({ code: code, likes: like ? [ip] : [] });
      return newStock.save();
    } else {
      if (like && foundStock.likes.indexOf(ip) === -1) {
        foundStock.likes.push(ip);
      }
      return foundStock.save();
    }
  });
}

function parseData(results) {
  let stockData = results.map(([saveResult, requestResult]) => {
    let stockInfo = requestResult.data;

    // Kiểm tra xem stockInfo có tồn tại và chứa latestPrice không
    if (stockInfo && stockInfo.latestPrice) {
      return {
        stock: saveResult.code, 
        price: stockInfo.latestPrice, 
        likes: saveResult.likes ? saveResult.likes.length : 0,  // Kiểm tra sự tồn tại của likes
      };
    } else {
      console.error(`Error: No valid price data for stock code ${saveResult.code}`);
      return { stock: saveResult.code, 
              price: 'N/A',  // Giá không có
              likes: saveResult.likes ? saveResult.likes.length : 0,  // Kiểm tra sự tồn tại của likes
      };
    }
  });

  // Thêm thuộc tính rel_likes nếu có nhiều hơn 1 mã cổ phiếu
  if (stockData.length > 1) {
    stockData[0].rel_likes = stockData[0].likes - stockData[1].likes;
    stockData[1].rel_likes = stockData[1].likes - stockData[0].likes;
  }

  console.log(stockData);
  return stockData;
}

module.exports = function (app) {

// Định nghĩa route để kiểm tra thông tin IP và ngôn ngữ của người dùng
  app.get('/api/testing', (req, res) => {
    // Trả về thông tin IP của người dùng và ngôn ngữ từ header 'accept-language'
    res.json({ IP: req.ip, language: req.headers['accept-language'] });
  });

  // Định nghĩa route cho API stock-prices để xử lý yêu cầu cổ phiếu
  app.route('/api/stock-prices')
    .get(function (req, res) {
      /* Process Input */
      if (typeof req.query.stock === 'string') {
        // Xử lý khi chỉ có một mã cổ phiếu.
        let stockName = req.query.stock.toUpperCase(); // Chuyển mã cổ phiếu thành chữ hoa

        // Kiểm tra nếu có yêu cầu "like" (người dùng muốn thích cổ phiếu)
        if (req.query.like && req.query.like === 'true') {
          // Nếu yêu cầu thích cổ phiếu, gọi hàm saveStock để lưu thông tin likes
          saveStock(stockName, true, req.ip)
            .then((savedStock) => {
              // Sau khi lưu stock, lấy thông tin giá của cổ phiếu từ API
              return axios.get(`https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${stockName}/quote`)
                .then((response) => {
                  const stockInfo = response.data || {};  // Lấy dữ liệu giá từ phản hồi

                  // Trả về thông tin cổ phiếu, giá và số lượng likes
                  res.json({
                    stockData: {
                      stock: savedStock.code,
                      price: stockInfo.latestPrice || 'N/A',  // Nếu không có giá, trả về 'N/A'
                      likes: savedStock.likes.length,  // Số lượng likes
                    },
                  });
                });
            })
            .catch((error) => {
              // Xử lý lỗi nếu gặp phải khi xử lý cổ phiếu
              console.error('Error processing stock:', error);
              res.status(500).send('Error processing stock');
            });
        } else {
          // Nếu không có yêu cầu "like", chỉ cần lấy thông tin cổ phiếu mà không thay đổi likes
          saveStock(stockName, false, req.ip)
            .then((savedStock) => {
              // Sau khi lưu stock, lấy thông tin giá của cổ phiếu từ API
              return axios.get(`https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${stockName}/quote`)
                .then((response) => {
                  const stockInfo = response.data || {};  // Lấy dữ liệu giá từ phản hồi

                  // Trả về thông tin cổ phiếu, giá và số lượng likes
                  res.json({
                    stockData: {
                      stock: savedStock.code,
                      price: stockInfo.latestPrice || 'N/A',  // Nếu không có giá, trả về 'N/A'
                      likes: savedStock.likes.length,  // Số lượng likes
                    },
                  });
                });
            })
            .catch((error) => {
              // Xử lý lỗi nếu gặp phải khi xử lý cổ phiếu
              console.error('Error processing stock:', error);
              res.status(500).send('Error processing stock');
            });
        }
      } else if (Array.isArray(req.query.stock)) {
        // Xử lý khi có nhiều mã cổ phiếu (2 cổ phiếu)
        let code = req.query.stock.map((stockCode) => stockCode.toUpperCase());  // Chuyển tất cả mã cổ phiếu thành chữ hoa

        // Tạo mảng các promises cho các mã cổ phiếu
        let promises = code.map((stockCode) =>
          Promise.all([
            saveStock(stockCode, req.query.like === 'true', req.ip),  // Lưu hoặc cập nhật thông tin cổ phiếu
            axios.get(`https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${stockCode}/quote`),  // Lấy giá của cổ phiếu từ API
          ])
        );

        // Chờ tất cả các promises hoàn thành
        Promise.all(promises)
          .then((results) => {
            // Xử lý kết quả của tất cả các cổ phiếu
            let stockResults = results.map(([saveResult, requestResult]) => {
              let priceData = requestResult.data;  // Lấy thông tin giá từ API

              // Kiểm tra dữ liệu phản hồi từ API.
              let price = priceData && priceData.latestPrice ? priceData.latestPrice : 'N/A';  // Nếu không có giá, trả về 'N/A'

              // Trả về thông tin cổ phiếu, giá và số lượng likes
              return {
                stock: saveResult.code,
                price: price,
                likes: saveResult.likes ? saveResult.likes.length : 0,  // Số lượng likes
              };
            });

            //Nếu có hai cổ phiếu, tính sự chênh lệch về số lượng likes
            if (stockResults.length === 2) {
              stockResults[0].rel_likes = stockResults[0].likes - stockResults[1].likes;
              stockResults[1].rel_likes = stockResults[1].likes - stockResults[0].likes;
            }

            //Trả về kết quả cho 2 cổ phiếu
            res.json({ stockData: stockResults });
          })
          .catch((error) => {
            // Xử lý lỗi nếu gặp phải khi xử lý nhiều cổ phiếu
            console.error('Error processing multiple stocks:', error);
            res.status(500).send('Error processing multiple stocks');
          });
      } else {
        // Nếu không nhận được query hợp lệ, trả về lỗi
        res.status(400).send('Invalid stock query');
      }
    });
};