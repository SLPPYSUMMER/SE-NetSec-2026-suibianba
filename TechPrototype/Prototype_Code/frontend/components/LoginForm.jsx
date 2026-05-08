/**
 * 登录表单组件
 * 处理用户登录逻辑
 */

import { useState } from 'react';
import { Button, Input, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';

const LoginForm = ({ onLogin }) => {
    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.username || !formData.password) {
            message.error('请填写用户名和密码');
            return;
        }

        setIsLoading(true);
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                message.success('登录成功');
                localStorage.setItem('token', result.data.access_token);
                localStorage.setItem('user', JSON.stringify(result.data.user));
                onLogin(result.data.user);
            } else {
                message.error(result.message || '登录失败');
            }
        } catch (error) {
            message.error('网络异常，请稍后重试');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card title="用户登录" style={{ maxWidth: 400, margin: '100px auto' }}>
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                    <Input
                        prefix={<UserOutlined />}
                        name="username"
                        placeholder="用户名"
                        value={formData.username}
                        onChange={handleChange}
                        style={{ width: '100%' }}
                    />
                </div>
                <div style={{ marginBottom: 24 }}>
                    <Input.Password
                        prefix={<LockOutlined />}
                        name="password"
                        placeholder="密码"
                        value={formData.password}
                        onChange={handleChange}
                        style={{ width: '100%' }}
                    />
                </div>
                <Button
                    type="primary"
                    htmlType="submit"
                    loading={isLoading}
                    style={{ width: '100%' }}
                >
                    登录
                </Button>
            </form>
        </Card>
    );
};

export default LoginForm;