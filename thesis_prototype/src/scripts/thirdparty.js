require("../styles/thirdparty_resizable.scss");
import * as d3 from "d3";

export const makeMovableDiv = (targetDiv, moveToggle) => {
    // makes dragging moveToggle move the targetDiv (both classes)
    // (both class names should start with a dot)
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const elmnt = document.querySelector(targetDiv);
    document.querySelector(targetDiv + " " + moveToggle).onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
    }
};

/* adapted from original code by by Hung Nguyen, see https://codepen.io/ZeroX-DG/pen/vjdoYe */
export const makeResizableDiv = (div, resizeCallback = null) => {
    // div is the unique class name for associated div (starts with a dot e.g. .test_resizable)
    // dynamically adding html for resizers
    let _resizers = d3.select("div" + div)
        .classed("resizable_div", true)
        .append("div");
    _resizers.classed("resizers", true);
    _resizers.append("div").attr("class", "resizer top-left");
    _resizers.append("div").attr("class", "resizer top-right");
    _resizers.append("div").attr("class", "resizer bottom-left");
    _resizers.append("div").attr("class", "resizer bottom-right");
    //
    const element = document.querySelector(div);
    const resizers = document.querySelectorAll(div + ' .resizer');
    const minimum_size = 20;
    let original_width = 0;
    let original_height = 0;
    let original_x = 0;
    let original_y = 0;
    let original_mouse_x = 0;
    let original_mouse_y = 0;
    for (let i = 0;i < resizers.length; i++) {
        const currentResizer = resizers[i];
        currentResizer.addEventListener('mousedown', function(e) {
            e.preventDefault();
            original_width = parseFloat(getComputedStyle(element, null).getPropertyValue('width').replace('px', ''));
            original_height = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
            original_x = element.getBoundingClientRect().left;
            original_y = element.getBoundingClientRect().top;
            original_mouse_x = e.pageX;
            original_mouse_y = e.pageY;
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResize);
        });

        function resize(e) {
            let width, height;
            if (currentResizer.classList.contains('bottom-right')) {
                width = original_width + (e.pageX - original_mouse_x);
                height = original_height + (e.pageY - original_mouse_y);
                if (width > minimum_size) {
                    element.style.width = width + 'px';
                }
                if (height > minimum_size) {
                    element.style.height = height + 'px';
                }
            }
            else if (currentResizer.classList.contains('bottom-left')) {
                height = original_height + (e.pageY - original_mouse_y);
                width = original_width - (e.pageX - original_mouse_x);
                if (height > minimum_size) {
                    element.style.height = height + 'px';
                }
                if (width > minimum_size) {
                    element.style.width = width + 'px';
                    element.style.left = original_x + (e.pageX - original_mouse_x) + 'px';
                }
            }
            else if (currentResizer.classList.contains('top-right')) {
                width = original_width + (e.pageX - original_mouse_x);
                height = original_height - (e.pageY - original_mouse_y);
                if (width > minimum_size) {
                    element.style.width = width + 'px';
                }
                if (height > minimum_size) {
                    element.style.height = height + 'px';
                    element.style.top = original_y + (e.pageY - original_mouse_y) + 'px';
                }
            }
            else {
                width = original_width - (e.pageX - original_mouse_x);
                height = original_height - (e.pageY - original_mouse_y);
                if (width > minimum_size) {
                    element.style.width = width + 'px';
                    element.style.left = original_x + (e.pageX - original_mouse_x) + 'px';
                }
                if (height > minimum_size) {
                    element.style.height = height + 'px';
                    element.style.top = original_y + (e.pageY - original_mouse_y) + 'px';
                }
            }
            if (resizeCallback) { resizeCallback(width, height); }
        }

        function stopResize() {
            window.removeEventListener('mousemove', resize);
        }
    }
};
