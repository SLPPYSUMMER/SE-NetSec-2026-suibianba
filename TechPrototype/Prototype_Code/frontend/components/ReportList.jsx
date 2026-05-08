/**
 * 漏洞报告列表组件
 * 展示漏洞报告列表，支持筛选和分页
 */

import { useState, useEffect } from 'react';
import { Table, Tag, Button, Select, Card, message } from 'antd';
import { EyeOutlined, EditOutlined, CheckCircleOutlined } from '@ant-design/icons';

const statusColors = {
    pending: 'orange',
    assigned: 'blue',
    in_progress: 'cyan',
    fixed: 'green',
    reviewed: 'purple',
    closed: 'gray'
};

const statusLabels = {
    pending: '待分派',
    assigned: '已分派',
    in_progress: '处理中',
    fixed: '已修复',
    reviewed: '已复核',
    closed: '已关闭'
};

const severityColors = {
    critical: 'red',
    high: 'orange',
    medium: 'yellow',
    low: 'green'
};

const severityLabels = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低'
};

const ReportList = ({ onView, onEdit }) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');

    useEffect(() => {
        fetchReports();
    }, [statusFilter]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            let url = '/api/reports';
            if (statusFilter) {
                url += `?status=${statusFilter}`;
            }
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            const result = await response.json();
            
            if (Array.isArray(result)) {
                setReports(result);
            } else {
                message.error('获取报告列表失败');
            }
        } catch (error) {
            message.error('网络异常');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = (status) => {
        setStatusFilter(status);
    };

    const columns = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            ellipsis: true
        },
        {
            title: '严重程度',
            dataIndex: 'severity',
            key: 'severity',
            render: (severity) => (
                <Tag color={severityColors[severity]}>
                    {severityLabels[severity]}
                </Tag>
            )
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: (status) => (
                <Tag color={statusColors[status]}>
                    {statusLabels[status]}
                </Tag>
            )
        },
        {
            title: '报告者',
            dataIndex: 'reporter',
            key: 'reporter',
            render: (reporter) => reporter?.username || '未知'
        },
        {
            title: '负责人',
            dataIndex: 'assignee',
            key: 'assignee',
            render: (assignee) => assignee?.username || '-'
        },
        {
            title: '创建时间',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (date) => new Date(date).toLocaleString()
        },
        {
            title: '操作',
            key: 'actions',
            render: (_, record) => (
                <div>
                    <Button
                        icon={<EyeOutlined />}
                        onClick={() => onView(record)}
                        size="small"
                        style={{ marginRight: 8 }}
                    >
                        查看
                    </Button>
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => onEdit(record)}
                        size="small"
                        style={{ marginRight: 8 }}
                    >
                        编辑
                    </Button>
                    {record.status === 'assigned' && (
                        <Button
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleStartProgress(record.id)}
                            size="small"
                            type="primary"
                        >
                            开始处理
                        </Button>
                    )}
                </div>
            )
        }
    ];

    const handleStartProgress = async (reportId) => {
        try {
            const response = await fetch(`/api/reports/${reportId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ status: 'in_progress' })
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                message.success('状态更新成功');
                fetchReports();
            } else {
                message.error(result.message || '更新失败');
            }
        } catch (error) {
            message.error('网络异常');
        }
    };

    return (
        <Card title="漏洞报告列表">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Select
                    placeholder="按状态筛选"
                    value={statusFilter}
                    onChange={handleStatusChange}
                    style={{ width: 150 }}
                >
                    <Select.Option value="">全部</Select.Option>
                    {Object.entries(statusLabels).map(([key, label]) => (
                        <Select.Option key={key} value={key}>
                            {label}
                        </Select.Option>
                    ))}
                </Select>
            </div>
            
            <Table
                columns={columns}
                dataSource={reports}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
            />
        </Card>
    );
};

export default ReportList;