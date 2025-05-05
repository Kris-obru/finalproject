"use strict";

const SERVER = window.location.protocol + "//dev-tang.com/aider-rs"

function AiderFactory(option) {
    let root = this;
    root.init(option);
    doPost(
        SERVER + '/open-api/collect',
        {
            site_id: root.site_id,
            title: root.title,
            url: root.url
        },
        function(status, json){
        })
    return root
}

AiderFactory.prototype.init = function (option) {
    let root = this;
    root['site_id'] = option.site_id
    if (option.title) {
        root['title'] = option.title
    } else {
        root['title'] = document.title
    }
    root['url'] = window.location.href
    return root
}

function isNumber(num){
    if(/^\d+$/.test(num)){
        return true;
    }else{
        return false;
    }
}

AiderFactory.prototype.render = function (doc, slice_num) {
    let root = this
    if (!slice_num || !(isNumber(slice_num))) {
        slice_num = 8
    }
    doGet(
        SERVER + '/open-api/collects/' + root.site_id,
        function(status, json) {
           if (status != 0) {
               return
           }
           if (json && json.code === "00000") {
                var data = json.data
                data = data.length > 8 ? data.slice(0, slice_num) : data
                let html = '<div class="aider-hot-list"><ul>';
                data.forEach((item) => {
                    html += '<li><a href="'+item.url+'">'+item.title+'</a></li>'
                })
                html += '</ul></div>'
                doc.innerHTML = html
           }
        }
    )
    return root
}

let doPost = function(url, site_info, callback) {
    let xhr = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP")
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4 && xhr.status == 200) {
            let json = JSON.parse(xhr.responseText)
            callback && callback(0, json)
        } else {
            callback && callback(xhr.status)
        }
    }
    xhr.onerror = function(e){
        console.log(e)
    }
    xhr.open('POST', url, true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send(window.JSON.stringify(site_info))
}

let doGet = function(url, callback) {
    let xhr = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP")
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4 && xhr.status == 200) {
            let json = JSON.parse(xhr.responseText)
            callback && callback(0, json)
        } else {
            callback && callback(xhr.status)
        }
    }
    xhr.onerror = function(e){
        console.log(e)
    }
    xhr.open('GET', url, true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send()
}

function Aider(options) {
    return new AiderFactory(options)
}

module.exports = Aider
module.exports.default = Aider