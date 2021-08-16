/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-undef */
/**
 * Token detail page
 */

$(document).ready(function () {
  const originUrl = window.location.origin;
  if (token) {
    $('#transfers-loading').show();
    $.ajax({
      method: 'GET',
      url: `${originUrl}/tokens/transfers/${tokenId}?page=1&limit=15`,
      success: function (msg) {
        $('#transfers-loading').hide();
        const { transfers, pages, totalPage, total } = msg.data;
        const parsedTransfers = transfers.map((transfer) => ({
          ...transfer,
          amount: formatAmount(transfer.amount / Math.pow(10, token.decimals)),
        }));
        renderViewTransfers(parsedTransfers, pages, 1, totalPage);
        $('#transfers #title-transfers').text(`A total of ${total} transactions found`);
        $('#tbCustom_wrapper').trigger('resize');
      },
      error: function (error) {
        $('#transfers-loading').hide();
      },
    });

    $.ajax({
      method: 'GET',
      url: `${originUrl}/tokens/holders/${tokenId}?page=1&limit=15&excludeZeroBalance=true`,
      success: function (msg) {
        const { holders, pages, totalPage, total } = msg.data;

        renderViewHolders(holders, pages, 1, totalPage);
        $('#holders #title-holders').text(`A total of ${total} holders`);
        $('#tbCustom_wrapper').trigger('resize');
      },
      error: function (error) {
        //do nothing
      },
    });
  } else {
    $('#transfers-loading').hide();
  }
});

function formatAmount(s) {
  const data = String(s).split('.');
  data[0] = data[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
  if (data.length == 1) return data[0];
  else return data.join('.');
}

function renderPagination(element, pages, currentPage, totalPage, test) {
  if (pages.length === 0 || pages[0] === 1) {
    element.append(`
      <a class= 'btn-floating waves-effect waves-light pagination-button disabled' onclick='customGoToPage${test}(1)'>
        <img src="/images/double_arrow_left.svg">
      </a>
    `);
  } else {
    element.append(`
      <a class= 'btn-floating waves-effect waves-light pagination-button' onclick="customGoToPage${test}(1)">
        <img src="/images/double_arrow_left.svg" >
      </a>
    `);
  }
  for (page of pages) {
    if (currentPage === page) {
      element.append(`
        <a class='btn-floating waves-effect waves-light pagination-button selected' onclick="customGoToPage${test}(${page})">${page}</a>
      `);
    } else {
      element.append(`
        <a class='btn-floating waves-effect waves-light pagination-button' onclick="customGoToPage${test}(${page})">${page}</a>
      `);
    }
  }
  if (pages.length === 0 || pages[pages.length - 1] === totalPage) {
    element.append(`
      <a class= 'btn-floating waves-effect waves-light pagination-button disabled' onclick="customGoToPage${test}(${totalPage})">
        <img src="/images/double_arrow_right.svg" >
      </a>
    `);
  } else {
    element.append(`
      <a class= 'btn-floating waves-effect waves-light pagination-button' onclick="customGoToPage${test}(${totalPage})">
        <img src="/images/double_arrow_right.svg" >
      </a>
    `);
  }
}

function customGoToPageTransfers(page) {
  const originUrl = window.location.origin;
  $('#transfers-loading').show();
  $.ajax({
    method: 'GET',
    url: `${originUrl}/tokens/transfers/${tokenId}?page=${page}&limit=${limit}`,
    success: function (msg) {
      const { transfers, pages, currentPage, totalPage } = msg.data;
      $('#tbody-transfers').children('tr').remove();
      $('#transfers .pagination').children('a').remove();
      renderViewTransfers(transfers, pages, currentPage, totalPage);
      $('#transfers-loading').hide();
    },
    error: function (error) {
      $('#transfers-loading').hide();
    },
  });
}

function customGoToPageHolders(page) {
  const originUrl = window.location.origin;
  $('#transfers-loading').show();
  $.ajax({
    method: 'GET',
    url: `${originUrl}/tokens/holders/${tokenId}?page=${page}&limit=${limit}&excludeZeroBalance=true`,
    success: function (msg) {
      const { holders, pages, currentPage, totalPage } = msg.data;
      $('#tbody-holders').children('tr').remove();
      $('#holders .pagination').children('a').remove();
      renderViewHolders(holders, pages, currentPage, totalPage);
      $('#transfers-loading').hide();
    },
    error: function (error) {
      $('#transfers-loading').hide();
    },
  });
}

function renderViewTransfers(transfers, pages, currentPage, totalPage) {
  const elementTrans = $('#tbody-transfers');
  const elementPage = $('#transfers .pagination');
  for (let i = 0; i < transfers.length; i++) {
    $('#tbody-transfers .odd').hide();
    elementTrans.append(`
          <tr class=tr-link>
            <td title=${transfers[i].txId}>
              <span class='text-truncate hash-tag'>
                <a href=/tx/${transfers[i].txId}>${transfers[i].txId}</a>
              </span>
            </td>
            <td >
              <span class='text-truncate hash-tag'> ${transfers[i].createdAt} </span>
            </td>
            <td title=${transfers[i].transferFrom}>
              <span class='text-truncate hash-tag'>
                <a href=/address/${transfers[i].transferFrom}>${transfers[i].transferFrom}</a>
              </span>
            </td>
            <td>
              <span class='text-truncate hash-tag'>
                <div class = circle>
                  <i class='fas fa-long-arrow-alt-right'></i>
                </div>
              </span>
            </td>
            <td title=${transfers[i].transferTo}>
              <span class='text-truncate hash-tag'>
                <a href=/address/${transfers[i].transferTo}>${transfers[i].transferTo}</a>
              </span>
            </td>
            <td>
              <span class='text-truncate hash-tag'>${transfers[i].amount}</span>
            </td>
          </tr>
    `);
  }
  renderPagination(elementPage, pages, currentPage, totalPage, 'Transfers');
}

function renderViewHolders(holders, pages, currentPage, totalPage) {
  const elementHolders = $('#tbody-holders');
  const elementPage = $('#holders .pagination');
  for (let i = 0; i < holders.length; i++) {
    $('#tbody-holders .odd').hide();
    elementHolders.append(`
          <tr class=tr-link>
            <td >
              <span class='text-truncate hash-tag'> ${i + 1} </span>
            </td>
            <td>
              <span class='text-truncate hash-tag'>
                <a href=/address/${holders[i].address}>${holders[i].address}</a>
              </span>
            </td>
            <td >
              <span class='text-truncate hash-tag'> ${holders[i].balance} </span>
            </td>
            <td >
              <span class='text-truncate hash-tag'> ${holders[i].percentage} </span>
            </td>
          </tr>
    `);
  }
  renderPagination(elementPage, pages, currentPage, totalPage, 'Holders');
  $('#tbCustom_wrapper').trigger('resize');
}
