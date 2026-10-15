import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
export async function exportFile(name:string,text:string,mime:string) {
  if(Platform.OS==='web') { const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return; }
  if(Platform.OS==='android') {
    const permission=await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if(!permission.granted) return;
    const uri=await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri,name.replace(/\.[^.]+$/,''),mime);
    await FileSystem.StorageAccessFramework.writeAsStringAsync(uri,text,{encoding:FileSystem.EncodingType.UTF8});
    Alert.alert('保存成功','文件已保存到你选择的手机文件夹。');
    return;
  }
  throw new Error('仅支持网页版与安卓');
}
export async function importFile():Promise<string|null> {
  const result=await DocumentPicker.getDocumentAsync({type:['application/json','text/plain','application/octet-stream'],copyToCacheDirectory:true});
  if(result.canceled) return null;
  const asset=result.assets[0];
  if(asset.size && asset.size>10*1024*1024) throw new Error('备份文件不能超过10MB');
  if(Platform.OS==='web') return await (await fetch(asset.uri)).text();
  return FileSystem.readAsStringAsync(asset.uri);
}
