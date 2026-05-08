/**
 * 漏洞报告表单组件
 * 用于提交新的漏洞报告
 */

import { useState } from 'react';
import { Button, Input, Select, Card, message, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

const { TextArea } = Input;

const severityOptions = [
    { value: 'critical', label: '严重' },
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' }
];

const ReportForm = ({ onSubmit, projects }) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        severity: 'medium',
        project_id: projects[0]?.id || ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [attachments, setAttachments] = useState([]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSelectChange = (value, field) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleUpload = ({ file }) => {
        setAttachments(prev => [...prev, file]);
        return false; // 阻止自动上传
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.title || !formData.description) {
            message.error('请填写标题和描述');
            return;
        }

        setIsLoading(true);
        
        try {
            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                message.success('报告提交成功');
                onSubmit(result.data);
                // 重置表单
                setFormData({
                    title: '',
                    description: '',
                    severity: 'medium',
                    project_id: projects[0]?.id || ''
                });
                setAttachments([]);
            } else {
                message.error(result.message || '提交失败');
            }
        } catch (error) {
            message.error('网络异常，请稍后重试');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card title="提交漏洞报告">
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8 }}>标题</label>
                    <Input
                        name="title"
                        placeholder="请输入漏洞标题"
                        value={formData.title}
                        onChange={handleChange}
                        style={{ width: '100%' }}
                    />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8 }}>项目</label>
                    <Select
                        value={formData.project_id}
                        onChange={(value) => handleSelectChange(value, 'project_id')}
                        style={{ width: '100%' }}
                    >
                        {projects.map(project => (
                            <Select.Option key={project.id} value={project.id}>
                                {project.name}
                            </Select.Option>
                        ))}
                    </Select>
                </div>
                
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8 }}>严重程度</label>
                    <Select
                        value={formData.severity}
                        onChange={(value) => handleSelectChange(value, 'severity')}
                        style={{ width: '100%' }}
                    >
                        {severityOptions.map(option => (
                            <Select.Option key={option.value} value={option.value}>
                                {option.label}
                            </Select.Option>
                        ))}
                    </Select>
                </div>
                
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8 }}>描述</label>
                    <TextArea
                        name="description"
                        placeholder="请详细描述漏洞情况，包括复现步骤"
                        value={formData.description}
                        onChange={handleChange}
                        rows={6}
                        style={{ width: '100%' }}
                    />
                </div>
                
                <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', marginBottom: 8 }}>附件</label>
                    <Upload
                        fileList={attachments}
                        customRequest={handleUpload}
                        multiple
                        accept=".png,.jpg,.pdf,.txt"
                    >
                        <Button icon={<UploadOutlined />}>点击上传附件</Button>
                    </Upload>
                </div>
                
                <Button
                    type="primary"
                    htmlType="submit"
                    loading={isLoading}
                >
                    提交报告
                </Button>
            </form>
        </Card>
    );
};

export default ReportForm;