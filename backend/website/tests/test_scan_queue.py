"""
扫描任务并发控制和队列机制的单元测试
"""
import unittest
import sys
import io

# 设置 stdout 为 UTF-8 编码以支持 Windows 环境
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from unittest.mock import Mock, patch, MagicMock
import threading
import time

# 测试前导入（确保模块可加载）
from website.scanner import (
    MAX_CONCURRENT_SCANS,
    _wait_queue,
    _queue_lock,
    _active_scans,
    _scans_lock,
    get_queue_status,
    get_queue_position,
    start_scheduler,
    stop_scheduler,
    launch_scan_async,
    _init_semaphore,
)


class TestScanQueueMechanism(unittest.TestCase):
    """测试扫描任务队列机制"""

    def setUp(self):
        """每个测试前的初始化"""
        # 清空等待队列
        with _queue_lock:
            _wait_queue.clear()
        
        # 清空活跃扫描
        with _scans_lock:
            _active_scans.clear()

    def tearDown(self):
        """每个测试后的清理"""
        # 停止调度器（如果正在运行）
        try:
            stop_scheduler()
        except:
            pass
        
        # 清空队列和活跃任务
        with _queue_lock:
            _wait_queue.clear()
        
        with _scans_lock:
            _active_scans.clear()

    def test_max_concurrent_scans_configuration(self):
        """测试最大并发数配置是否正确读取"""
        self.assertIsInstance(MAX_CONCURRENT_SCANS, int)
        self.assertGreater(MAX_CONCURRENT_SCANS, 0)
        print(f"✅ 最大并发数配置: {MAX_CONCURRENT_SCANS}")

    def test_get_queue_status_empty(self):
        """测试获取空队列状态"""
        status = get_queue_status()
        
        self.assertEqual(status['active_count'], 0)
        self.assertEqual(status['waiting_count'], 0)
        self.assertEqual(status['max_concurrent'], MAX_CONCURRENT_SCANS)
        self.assertEqual(len(status['queue_positions']), 0)
        print("✅ 空队列状态查询正常")

    def test_launch_scan_async_adds_to_queue(self):
        """测试 launch_scan_async 将任务加入队列"""
        # 创建模拟的 ScanTask 对象
        mock_task = Mock()
        mock_task.id = 1
        mock_task.target = "https://example.com"
        mock_task.scanner_type = "quick"
        
        # 调用 launch_scan_async（不实际启动调度器）
        result = launch_scan_async(mock_task)
        
        # 验证返回值
        self.assertTrue(result['queued'])
        self.assertEqual(result['position'], 1)
        self.assertEqual(result['status'], 'pending')
        self.assertIn('位置', result['message'])
        
        # 验证任务已加入队列
        with _queue_lock:
            self.assertEqual(len(_wait_queue), 1)
            task_id, target, scanner_type = _wait_queue[0]
            self.assertEqual(task_id, 1)
            self.assertEqual(target, "https://example.com")
            self.assertEqual(scanner_type, "quick")
        
        print(f"✅ 任务成功加入队列，位置: #{result['position']}")

    def test_launch_multiple_tasks_queue_order(self):
        """测试多个任务按 FIFO 顺序排队"""
        tasks = []
        for i in range(5):
            mock_task = Mock()
            mock_task.id = i + 1
            mock_task.target = f"https://example{i}.com"
            mock_task.scanner_type = "deep"
            
            result = launch_scan_async(mock_task)
            tasks.append(result)
            
            # 验证队列位置递增
            self.assertEqual(result['position'], i + 1)
        
        # 验证队列中的顺序
        with _queue_lock:
            self.assertEqual(len(_wait_queue), 5)
            for i, (task_id, _, _) in enumerate(_wait_queue):
                self.assertEqual(task_id, i + 1)
        
        print(f"✅ 5 个任务按 FIFO 顺序排队成功")

    def test_get_queue_position(self):
        """测试获取单个任务的队列位置"""
        # 添加几个任务到队列
        for i in range(3):
            mock_task = Mock()
            mock_task.id = i + 10
            mock_task.target = f"https://test{i}.com"
            mock_task.scanner_type = "quick"
            launch_scan_async(mock_task)
        
        # 测试已存在的任务
        pos_11 = get_queue_position(11)
        self.assertEqual(pos_11, 2)  # 第 2 个位置
        
        pos_10 = get_queue_position(10)
        self.assertEqual(pos_10, 1)  # 第 1 个位置
        
        pos_12 = get_queue_position(12)
        self.assertEqual(pos_12, 3)  # 第 3 个位置
        
        # 测试不存在的任务
        pos_not_exist = get_queue_position(999)
        self.assertIsNone(pos_not_exist)
        
        print("✅ 队列位置查询功能正常")

    def test_get_queue_status_with_waiting_tasks(self):
        """测试有等待任务时的队列状态"""
        # 添加 4 个任务
        for i in range(4):
            mock_task = Mock()
            mock_task.id = i + 100
            mock_task.target = f"https://queue{i}.com"
            mock_task.scanner_type = "deep"
            launch_scan_async(mock_task)
        
        status = get_queue_status()
        
        self.assertEqual(status['waiting_count'], 4)
        self.assertEqual(len(status['queue_positions']), 4)
        self.assertIn(100, status['queue_positions'])
        self.assertIn(101, status['queue_positions'])
        self.assertIn(102, status['queue_positions'])
        self.assertIn(103, status['queue_positions'])
        
        print(f"✅ 队列状态: 等待中={status['waiting_count']}, 位置映射={status['queue_positions']}")

    @patch('website.scanner.start_scheduler')
    def test_launch_scan_starts_scheduler(self, mock_start_scheduler):
        """测试 launch_scan_async 会启动调度器"""
        mock_task = Mock()
        mock_task.id = 999
        mock_task.target = "https://test.com"
        mock_task.scanner_type = "quick"
        
        launch_scan_async(mock_task)
        
        # 验证 start_scheduler 被调用
        mock_start_scheduler.assert_called_once()
        print("✅ launch_scan_async 正确触发调度器启动")


class TestConcurrencyControl(unittest.TestCase):
    """测试并发控制功能"""

    def setUp(self):
        """初始化"""
        with _queue_lock:
            _wait_queue.clear()
        with _scans_lock:
            _active_scans.clear()

    def tearDown(self):
        """清理"""
        try:
            stop_scheduler()
        except:
            pass
        with _queue_lock:
            _wait_queue.clear()
        with _scans_lock:
            _active_scans.clear()

    def test_semaphore_initialization(self):
        """测试信号量初始化"""
        semaphore = _init_semaphore()
        
        self.assertIsNotNone(semaphore)
        # 验证信号量的初始值等于最大并发数
        # 注意：Semaphore 内部值无法直接读取，但可以通过 acquire/release 验证
        
        print(f"✅ 信号量初始化成功 (最大并发: {MAX_CONCURRENT_SCANS})")

    @patch('website.scanner.run_scan')
    @patch('website.scanner._scheduler_loop')
    def test_semaphore_limits_concurrency(self, mock_scheduler_loop, mock_run_scan):
        """
        测试信号量限制并发数（概念性测试）。
        
        实际测试需要多线程环境，这里验证逻辑正确性。
        """
        # 这个测试主要验证代码结构正确
        # 真正的并发限制需要在集成测试中验证
        
        from website.scanner import _run_scan_with_cleanup
        import threading
        
        semaphore = _init_semaphore()
        
        # 记录当前可用槽位
        acquired_count = []
        
        def mock_run_wrapper(scan_id, target, scan_type, sem):
            acquired_count.append(threading.current_thread().name)
            time.sleep(0.1)  # 模拟运行
            sem.release()
        
        # 尝试多次 acquire
        success_acquires = 0
        for i in range(MAX_CONCURRENT_SCANS + 2):  # 尝试超过最大并发数的次数
            if semaphore.acquire(blocking=False):
                success_acquires += 1
            else:
                break  # 无法再获取，说明已达上限
        
        # 应该只能获取 MAX_CONCURRENT_SCANS 次
        self.assertEqual(success_acquires, MAX_CONCURRENT_SCANS)
        
        # 释放所有获取的信号量
        for _ in range(success_acquires):
            semaphore.release()
        
        print(f"✅ 并发控制有效: 最大允许 {MAX_CONCURRENT_SCANS} 个并发任务")


class TestSchedulerLifecycle(unittest.TestCase):
    """测试调度器生命周期"""

    def setUp(self):
        with _queue_lock:
            _wait_queue.clear()
        with _scans_lock:
            _active_scans.clear()

    def tearDown(self):
        try:
            stop_scheduler()
        except:
            pass
        with _queue_lock:
            _wait_queue.clear()
        with _scans_lock:
            _active_scans.clear()

    @patch('website.scanner._scheduler_loop')
    def test_start_scheduler_creates_thread(self, mock_loop):
        """测试启动调度器会创建线程"""
        start_scheduler()
        
        # 给线程一点时间启动
        time.sleep(0.1)
        
        mock_loop.assert_called_once()
        print("✅ 调度器线程创建成功")

    def test_stop_scheduler(self):
        """测试停止调度器"""
        # 先启动
        start_scheduler()
        time.sleep(0.1)
        
        # 再停止
        stop_scheduler()
        
        # 验证全局状态
        from website.scanner import _scheduler_running
        self.assertFalse(_scheduler_running)
        
        print("✅ 调度器停止成功")


if __name__ == '__main__':
    # 运行测试
    unittest.main(verbosity=2)
