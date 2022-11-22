@tool

extends Control


@onready var camera: FreeCamera3D = %FreeCamera3D
var initCameraTransform: Transform3D
var initCameraRotation: Vector3

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
    initCameraTransform = camera.transform
    initCameraRotation = camera.rotation
    
    %camera_aperture_s.value = %always_uniform_camera.aperture
    %camera_fov_s.value = camera.fov
    %camera_focus_s.value = %always_uniform_camera.focus
    %gamma_s.value = %always_uniform_camera.gamma
    %max_sample_s.value = %OutShaderRect.max_sample


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
    %fps.text = str(Performance.get_monitor(Performance.TIME_FPS))
    %sample.text = str(%OutShaderRect.frame)
    if is_instance_valid(camera):
        %camera_speed.text = str(camera.max_speed)
        %camera_speed_s.value = camera.max_speed


func _on_sampleonceb_pressed() -> void:
    %OutShaderRect.frame = 0


func _on_restcamerab_pressed() -> void:
    camera.transform = initCameraTransform
    camera.reset_rotation(initCameraRotation)
    %OutShaderRect.frame = 0


func _on_camera_speed_s_value_changed(value: float) -> void:
    camera.max_speed = value


func _on_camera_aperture_s_value_changed(value: float) -> void:
    %always_uniform_camera.aperture = value
    %camera_aperture.text = str(value)
    %OutShaderRect.frame = 0


func _on_camera_focus_s_value_changed(value: float) -> void:
    %always_uniform_camera.focus = value
    %camera_focus.text = str(value)
    %OutShaderRect.frame = 0


func _on_camera_fov_s_value_changed(value: float) -> void:
    %always_uniform_camera.vfov = value
    %camera_fov.text = str(value)
    %OutShaderRect.frame = 0


func _on_gamma_s_value_changed(value: float) -> void:
    %always_uniform_camera.gamma = value
    %gamma.text = str(value)
    %OutShaderRect.frame = 0


func _on_max_sample_s_value_changed(value: float) -> void:
    %OutShaderRect.max_sample = int(value)
    %max_sample.text = str(value)
