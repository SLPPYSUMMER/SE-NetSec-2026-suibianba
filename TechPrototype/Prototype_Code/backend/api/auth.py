"""
认证API模块
提供用户登录、注册、Token刷新等功能
"""

from ninja import Router
from ninja.security import HttpBearer
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.exceptions import ObjectDoesNotExist
import bcrypt

router = Router()

class AuthBearer(HttpBearer):
    """JWT Token认证类"""
    
    def authenticate(self, request, token):
        try:
            # 验证Token逻辑
            return token
        except Exception:
            return None

@router.post("/login")
def login(request, username: str, password: str):
    """
    用户登录接口
    
    Args:
        username: 用户名
        password: 密码
        
    Returns:
        用户信息和JWT Token
    """
    try:
        user = User.objects.get(username=username)
        
        # 验证密码（BCrypt）
        if bcrypt.checkpw(password.encode('utf-8'), user.password.encode('utf-8')):
            # 生成JWT Token
            refresh = RefreshToken.for_user(user)
            
            return {
                "status": "success",
                "data": {
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "email": user.email,
                        "role": user.profile.role if hasattr(user, 'profile') else 'reporter'
                    },
                    "access_token": str(refresh.access_token),
                    "refresh_token": str(refresh)
                }
            }
        else:
            return {"status": "error", "message": "用户名或密码错误"}
            
    except ObjectDoesNotExist:
        return {"status": "error", "message": "用户不存在"}

@router.post("/register")
def register(request, username: str, email: str, password: str):
    """
    用户注册接口
    
    Args:
        username: 用户名
        email: 邮箱
        password: 密码
        
    Returns:
        注册成功的用户信息
    """
    if User.objects.filter(username=username).exists():
        return {"status": "error", "message": "用户名已存在"}
    
    if User.objects.filter(email=email).exists():
        return {"status": "error", "message": "邮箱已被注册"}
    
    # BCrypt加密密码
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    user = User.objects.create(
        username=username,
        email=email,
        password=hashed_password,
        is_active=True
    )
    
    return {
        "status": "success",
        "data": {
            "id": user.id,
            "username": user.username,
            "email": user.email
        }
    }

@router.post("/refresh")
def refresh_token(request, refresh_token: str):
    """
    Token刷新接口
    
    Args:
        refresh_token: 刷新Token
        
    Returns:
        新的访问Token
    """
    try:
        refresh = RefreshToken(refresh_token)
        access_token = str(refresh.access_token)
        
        return {
            "status": "success",
            "data": {
                "access_token": access_token
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}