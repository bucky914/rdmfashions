const STATUSES=["Pending","Ordered","Confirmed","Delivered","Cancelled"];
let allOrders=[];

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
}[c]));

async function loadOrders(){
  const msg=document.querySelector(".admin-message");
  const{data,error}=await supabaseClient
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at",{ascending:false});

  if(error){
    msg.textContent=`Unable to load orders: ${error.message}`;
    return;
  }

  allOrders=data||[];
  render();
}

function itemSummary(order){
  const items=Array.isArray(order.order_items)&&order.order_items.length
    ? order.order_items
    : [{
        color: "—",
        quantity: order.quantity,
        unit_price: 99,
        line_total: order.subtotal
      }];

  return items.map(i=>`
    <div><strong>${esc(i.color)}</strong> × ${Number(i.quantity)} = ₹${Number(i.line_total||0).toLocaleString("en-IN")}</div>
  `).join("");
}

function render(){
  const term=document.querySelector("#search").value.toLowerCase();
  const status=document.querySelector("#status-filter").value;

  const rows=allOrders
    .filter(o=>!status||o.status===status)
    .filter(o=>[o.id,o.customer_name,o.phone,o.email]
      .some(v=>String(v).toLowerCase().includes(term)));

  document.querySelector("#orders-body").innerHTML=rows.length
    ?rows.map(o=>`
      <tr>
        <td>${esc(o.id)}</td>
        <td>${esc(o.customer_name)}</td>
        <td>${esc(o.phone)}</td>
        <td>${esc(o.email)}</td>
        <td>${esc(o.address)}</td>
        <td>${itemSummary(o)}</td>
        <td>${o.quantity}</td>
        <td>₹${Number(o.subtotal).toLocaleString("en-IN")}</td>
        <td>₹${Number(o.delivery_charge).toLocaleString("en-IN")}</td>
        <td>₹${Number(o.total).toLocaleString("en-IN")}</td>
        <td>${esc(o.payment_status || "pending")}</td>
        <td>${esc(o.razorpay_payment_id || "—")}</td>
        <td>${new Date(o.created_at).toLocaleString("en-IN")}</td>
        <td>
          <select class="status-select" data-id="${o.id}">
            ${STATUSES.map(s=>`<option value="${s}" ${s===o.status?"selected":""}>${s}</option>`).join("")}
          </select>
        </td>
      </tr>`).join("")
    :`<tr><td colspan="14">No orders found.</td></tr>`;

  document.querySelectorAll(".status-select").forEach(s=>{
    s.onchange=()=>changeStatus(s.dataset.id,s.value);
  });
}

async function changeStatus(id,status){
  const msg=document.querySelector(".admin-message");
  const{error}=await supabaseClient.from("orders").update({status}).eq("id",id);

  if(error){
    msg.textContent=`Status was not changed: ${error.message}`;
    return;
  }

  allOrders=allOrders.map(o=>o.id===id?{...o,status}:o);
  render();
  msg.textContent="Order status updated.";
  msg.style.color="#20724d";
}

document.addEventListener("DOMContentLoaded",async()=>{
  const{data:{session}}=await supabaseClient.auth.getSession();

  if(!session){
    location.href="login.html";
    return;
  }

  document.querySelector("#logout").onclick=async()=>{
    await supabaseClient.auth.signOut();
    location.href="login.html";
  };

  document.querySelector("#search").oninput=render;
  document.querySelector("#status-filter").onchange=render;

  loadOrders();
});
