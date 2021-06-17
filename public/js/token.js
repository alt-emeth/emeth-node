/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-undef */
/**
 * Token detail page
 */

$(document).ready(function () {
  if (token) {
    $.ajax({
      method: 'GET',
      url: `${url}/tokens/transfers-holders/${tokenId}?excludeZeroBalance=true`,
      success: function (msg) {
        const {
          transfers,
          holders,
          pagesTransfers,
          pagesHolders,
          totalPageTransfers,
          totalPageHolders,
          totalTransfers,
          totalHolders,
        } = msg.data;
        renderViewTransfers(transfers, pagesTransfers, 1, totalPageTransfers);
        renderViewHolders(holders, pagesHolders, 1, totalPageHolders);
        $('#transfers #title-transfers').text(`A total of ${totalTransfers} transactions found`);
        $('#holders #title-holders').text(`A total of ${totalHolders} holders`);
        $('#tbCustom_wrapper').trigger('resize');
        $('#transfers-loading').hide();
      },
      error: function (error) {
        $('#transfers-loading').hide();
      },
    });
  } else {
    $('#transfers-loading').hide();
  }
});

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
  $('#transfers-loading').show();
  $.ajax({
    method: 'GET',
    url: `${url}/tokens/transfers/${tokenId}?page=${page}&limit=${limit}`,
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
  $('#transfers-loading').show();
  $.ajax({
    method: 'GET',
    url: `${url}/tokens/holders/${tokenId}?page=${page}&limit=${limit}&excludeZeroBalance=true`,
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
            <td title=${transfers[i].source}>
              <span class='text-truncate hash-tag'>
                <a href=/address/${transfers[i].source}>${transfers[i].source}</a>
              </span>
            </td>
            <td>
              <span class='text-truncate hash-tag'>
                <div class = circle>
                  <i class='fas fa-long-arrow-alt-right'></i>
                </div>
              </span>
            </td>
            <td title=${transfers[i].target}>
              <span class='text-truncate hash-tag'>
                <a href=/address/${transfers[i].target}>${transfers[i].target}</a>
              </span>
            </td>
            <td>
              <span class='text-truncate hash-tag'>${transfers[i].quantity}</span>
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
              <span class='text-truncate hash-tag'> ${holders[i].quantity} </span>
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
