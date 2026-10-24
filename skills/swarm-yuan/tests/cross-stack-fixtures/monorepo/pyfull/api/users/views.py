from .models import User

def list_users(request):
    return User.objects.all()
