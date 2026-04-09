const url = "https://maps.app.goo.gl/DtKYXb2qTDQD8Pbh7";
fetch(url, { redirect: "follow" })
  .then(res => console.log(res.url))
  .catch(console.error);
