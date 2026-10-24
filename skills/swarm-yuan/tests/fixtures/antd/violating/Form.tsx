import { message } from 'antd';
import React from 'react';

class OldForm extends React.Component {
  render() {
    return (
      <div>
        <button onClick={() => message.success('ok')}>提交</button>
        <Upload>
          <button>上传</button>
        </Upload>
        <Form>
          <Form.Item label="名称">
            <Input />
          </Form.Item>
        </Form>
      </div>
    );
  }
}

const Wrapped = Form.create()(OldForm);
export default Wrapped;
