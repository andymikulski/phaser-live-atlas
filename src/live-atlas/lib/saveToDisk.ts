export default function saveToDisk(content:object, fileName:string) {
  const a = document.createElement("a");

  let contents = JSON.stringify(content);

  const file = new Blob([contents], {type: 'text/plain'});
  a.href = URL.createObjectURL(file);
  a.download = fileName;

  // Triggers a download at the browser level for a text file
  a.click();
}