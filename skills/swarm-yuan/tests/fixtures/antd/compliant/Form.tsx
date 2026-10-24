import { App, Form, Input, Upload, Button } from 'antd';
import React from 'react';

// compliant fixture: App.useApp 注入式 + useForm + ConfigProvider token + Upload beforeUpload
const MyForm: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const beforeUpload = (file: File) => {
    const limit = 10 * 1024 * 1024;
    if (file.size > limit) {
      message.error('文件过大');
      return false;
    }
    return true;
  };

  return (
    <Form form={form} initialValues={{ name: '' }}>
      <Form.Item label="名称" name="name">
        <Input />
      </Form.Item>
      <Form.Item>
        <Button onClick={() => message.success('提交成功')}>提交</Button>
      </Form.Item>
      <Form.Item>
        <Upload beforeUpload={beforeUpload}>
          <Button>上传</Button>
        </Upload>
      </Form.Item>
    </Form>
  );
};

export default function AppRoot() {
  return (
    <App>
      <MyForm />
    </App>
  );
}
